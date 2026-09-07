/**
 * verify-tx BullMQ worker. Webhooks, polling, client hints and reconciliation
 * all converge here so chain verification and projection application have one
 * idempotent path.
 *
 * Lifecycle the worker must implement (per stage-2-listeners.md L154):
 *   1. Dedup: `SELECT … FROM escrow_transactions WHERE tx_ref = $1` → skip.
 *   2. `adapter.verifyTx(tx_ref, { expected_event })`. Not-confirmed-yet
 *      throws `RetryableError` so BullMQ retries with backoff.
 *   3. Decode event payload (escrow_ref, actor, amount, …).
 *   4. Apply state transition inside a single `db.transaction`, status-guarded
 *      so a concurrent reconcile-driven retry can't double-apply.
 *   5. Republish event onto the internal bus (notifications, WS broadcast).
 *
 * Idempotency:
 *   - BullMQ jobId = `dedupKey({chain_id, tx_ref, event})`, duplicate
 *     enqueues no-op (BullMQ-level dedup).
 *   - Handler dedup: `escrow_transactions.tx_ref` UNIQUE catches anything
 *     the queue layer missed (different chain_id values, manual retries).
 */

import { eq } from 'drizzle-orm'
import { escrow_transactions, tx_attempts } from '@tenda/shared/db/schema'
import type { ChainRegistry, EscrowEvent } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'
import {
  applyEscrowEvent,
  type EscrowEventStore,
  type EscrowRepublishEvent,
  type InternalEscrowEvent,
} from '@server/lib/escrow-events'

// ---------- store abstraction --------------------------------------------

/**
 * Decoupled DB surface, matches the `SponsorStore` / `NonceStore` pattern
 * (see lib/sponsor.ts, lib/nonce.ts). Lets unit tests use an in-memory
 * implementation without standing up Postgres.
 */
export interface VerifyTxStore {
  /** True iff `escrow_transactions` already has a row with this tx_ref. */
  isProcessed(tx_ref: string): Promise<boolean>
  /** Stamp tx_attempts.confirmed_at (no-op if no attempt row exists). */
  markAttemptConfirmed(tx_ref: string): Promise<void>
  /**
   * Stamp tx_attempts.failed_at + failure_code (no-op if no row).
   * Stage-3 note: when the BASE paymaster lands (#45), failed SPONSORED
   * attempts (was_sponsored) must also restore the user's
   * sponsored_tx_remaining via lib/sponsor.ts, the column exists for
   * exactly that; Solana has no sponsored txs so nothing restores today.
   */
  markAttemptFailed(tx_ref: string, failure_code: string): Promise<void>
}

export function drizzleVerifyTxStore(db: AppDatabase): VerifyTxStore {
  return {
    async isProcessed(tx_ref) {
      const rows = await db
        .select({ id: escrow_transactions.id })
        .from(escrow_transactions)
        .where(eq(escrow_transactions.tx_ref, tx_ref))
        .limit(1)
      return rows.length > 0
    },
    async markAttemptConfirmed(tx_ref) {
      await db
        .update(tx_attempts)
        .set({ confirmed_at: new Date() })
        .where(eq(tx_attempts.tx_ref, tx_ref))
    },
    async markAttemptFailed(tx_ref, failure_code) {
      await db
        .update(tx_attempts)
        .set({ failed_at: new Date(), failure_code })
        .where(eq(tx_attempts.tx_ref, tx_ref))
    },
  }
}

// ---------- payload ------------------------------------------------------

/** Origin of a verify-tx enqueue; `sweep` is the platform broadcasting a
 *  creator's own refund for them (#43, see lib/tx-attempts `source`). */
export type VerifyTxSource = 'webhook' | 'polling' | 'client-hint' | 'reconcile' | 'sweep'

export interface VerifyTxJobPayload {
  /** CAIP-2 chain id; resolves to a `ChainAdapter` via the registry. */
  chain_id: string
  /** Solana signature (base58) or EVM tx hash (0x…). */
  tx_ref: string
  /**
   * Event the producer expected, cross-checked against the decoded
   * payload. Webhook/polling producers omit it (they only know a signature
   * touched the program); the adapter then matches any escrow event.
   */
  expected_event?: EscrowEvent
  /**
   * Optional client-side hint, verified against decoded `escrow_ref`.
   * Mismatched hint is treated as fraud and logged.
   */
  escrow_id?: string
  /** Origin of the enqueue. Used for retry-strategy tuning only. */
  source: VerifyTxSource
}

// ---------- result -------------------------------------------------------

export type VerifyTxResult =
  /** `tx_ref` already settled, or not an escrow tx, no work to do. */
  | { skipped: true; reason: 'already_processed' | 'not_an_escrow_tx' }
  /** Tx confirmed but execution failed / event mismatched, terminal. */
  | { skipped: false; failed: true; reason: string }
  /** State applied and internal event republished. */
  | {
      skipped: false
      failed: false
      event: EscrowEvent
      internal_event: InternalEscrowEvent
      escrow_id: string
      applied: true
    }

// ---------- retryable signal --------------------------------------------

/**
 * Thrown when the tx isn't confirmed yet, BullMQ should retry with backoff.
 * Distinct from `AppError` so the worker config can branch on it (retry
 * vs dead-letter). Has no HTTP semantics; never thrown from a route.
 */
export class RetryableError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'RetryableError'
  }
}

// ---------- handler deps -------------------------------------------------

export interface VerifyTxDeps {
  store: VerifyTxStore
  chains: ChainRegistry
  eventStore: EscrowEventStore
  /**
   * Republish seam. The worker wiring (#33) hooks `fanOutEscrowEvent`
   * (workers/escrow-fanout) here, and that module owns WHICH surfaces the
   * event reaches — naming them here was a list that went stale the first
   * time one was added. Best-effort: a republish failure must not fail the
   * (already-applied) state transition.
   *
   * The payload shape is owned by lib/escrow-events (see EscrowRepublishEvent)
   * so this side and the fan-out cannot drift as fields are added.
   */
  republish(event: EscrowRepublishEvent): Promise<void>
  log: { warn(obj: Record<string, unknown>, msg: string): void }
}

// ---------- idempotency key ---------------------------------------------

/**
 * BullMQ jobId factory. Spec lives in core/queue/idempotency.ts (Stage 2);
 * Stage 0 inlines the format so the queue plugin's `EnqueueOptions.job_id`
 * can be populated consistently.
 *
 * Format: `verify-tx.{chain_id}.{tx_ref}.{event}` with ':' stripped. `tx_ref`
 * is the high-entropy component (base58 sig or 0x-hex hash) so collisions
 * across (chain, event) tuples are vanishingly unlikely. Event is included
 * because the same tx can emit multiple EscrowEvent types in principle (though
 * the current contract emits one).
 *
 * The ':' is stripped because this id has FOUR parts, not because BullMQ bans
 * the character — see the note on the strip below for the real rule.
 */
export function verifyTxDedupKey(args: {
  chain_id: string
  tx_ref: string
  /** Producers without an expectation (webhook/polling) pass 'Any'. */
  event: EscrowEvent | 'Any'
}): string {
  // BullMQ does NOT ban ':' outright — an earlier version of this comment said
  // it did, and that was wrong in a way that would mislead the next person to
  // need a keyed id (core/queue/idempotency.ts emits colons on purpose).
  //
  // The real rule, from `Job.validateOptions` (bullmq 5.78,
  // classes/job.js:1041-1050) and confirmed against a live queue: a custom
  // jobId may contain EITHER no ':' at all OR exactly two of them — the check
  // is `includes(':') && split(':').length !== 3` → throw. One colon is
  // rejected as surely as three. Separately, an id that round-trips through
  // parseInt unchanged ('12345') is rejected as an integer, which this format
  // cannot produce because it always starts with 'verify-tx'.
  //
  // This id has four parts, so a raw ':' join would land on the wrong side of
  // that rule, and CAIP-2 chain ids (e.g. 'solana:devnet') carry one of their
  // own. Joining with '.' and stripping ':' sidesteps the count entirely.
  // ':' is the ONLY reserved char in the inputs, so swapping it for '.' can't
  // collide (no part otherwise contains '.').
  return ['verify-tx', args.chain_id, args.tx_ref, args.event]
    .join('.')
    .replaceAll(':', '.')
}

// ---------- handler ------------------------------------------------------

/**
 * Entry point for the BullMQ worker (stage-2-listeners.md § Verify job
 * handler). Returns `{ skipped: true }` if the tx_ref was already
 * processed. Throws `RetryableError` when the tx isn't confirmed yet,
 * BullMQ retries with backoff; everything else is terminal.
 */
export async function verifyTxJobHandler(
  deps: VerifyTxDeps,
  job: VerifyTxJobPayload,
): Promise<VerifyTxResult> {
  // Step 1, idempotency check.
  if (await deps.store.isProcessed(job.tx_ref)) {
    // The prior worker may have committed the atomic escrow transition and
    // then crashed before stamping the separate attempt row. Repair that
    // bookkeeping on every replay; this is a no-op for listener-only txs.
    await deps.store.markAttemptConfirmed(job.tx_ref)
    return { skipped: true, reason: 'already_processed' }
  }

  // Step 2, fetch + verify on-chain; decode the event. The decoded
  // payload is the source of truth, the producer's hints are only
  // cross-checked inside the adapter.
  const adapter = deps.chains.get(job.chain_id)
  const verified = await adapter.verifyTx(job.tx_ref, {
    ...(job.expected_event !== undefined ? { expected_event: job.expected_event } : {}),
    ...(job.escrow_id !== undefined ? { escrow_id: job.escrow_id } : {}),
  })

  if (!verified.confirmed) {
    throw new RetryableError(verified.reason ?? 'not_yet_confirmed')
  }
  // Confirmed but not an escrow state-change (program upgrade / IDL write /
  // unrelated tx picked up by the wide-net polling feed). Terminal + inert:
  // record no failed attempt, apply nothing.
  if ('irrelevant' in verified) {
    return { skipped: true, reason: 'not_an_escrow_tx' }
  }
  if (verified.failed) {
    await deps.store.markAttemptFailed(job.tx_ref, 'TX_FAILED')
    return { skipped: false, failed: true, reason: verified.reason }
  }

  // Steps 3+4, status-guarded transition + escrow_transactions audit row.
  const result = await applyEscrowEvent(
    { store: deps.eventStore, chain_ns: adapter.namespace },
    verified.event,
    job.tx_ref,
  )

  // A new tx that misses the status guard may be behind its predecessor.
  if (!result.applied) {
    deps.log.warn(
      {
        tx_ref: job.tx_ref,
        escrow_id: result.escrow_id,
        event: verified.event.name,
        source: job.source,
      },
      'verify-tx: transition skipped by the status guard on a new tx (out-of-order or drift)',
    )
    // A different event for this escrow may still be ahead of us in another
    // worker. Do not stamp this attempt confirmed or drop it permanently;
    // BullMQ retries after the predecessor has had a chance to apply.
    throw new RetryableError('status_guard_waiting_for_predecessor')
  }

  await deps.store.markAttemptConfirmed(job.tx_ref)

  // Step 5, hand the durable transition to the fan-out. Best-effort: the state
  // is already durable; a republish failure is logged, never thrown.
  try {
    await deps.republish({
      internal_event: result.internal_event,
      escrow_id: result.escrow_id,
      wire_event: verified.event.name,
      tx_ref: job.tx_ref,
      counterparty_id: result.counterparty_id,
      passed_applicant_ids: result.passed_applicant_ids,
      revived_applicant_ids: result.revived_applicant_ids,
    })
  } catch (err) {
    deps.log.warn(
      { err, tx_ref: job.tx_ref, escrow_id: result.escrow_id },
      'verify-tx: republish failed (state already applied)',
    )
  }

  return {
    skipped: false,
    failed: false,
    event: verified.event.name,
    internal_event: result.internal_event,
    escrow_id: result.escrow_id,
    applied: true,
  }
}
