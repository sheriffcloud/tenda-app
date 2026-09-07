/**
 * sweep-escrows repeatable job (#43): release funds an escrow is holding for a
 * creator who is never coming back to release them.
 *
 * The gap it closes. Both terminal-by-timeout states end with money sitting in
 * a contract that only one address could previously withdraw it to — and that
 * address belongs to whoever posted the gig. `jobs/expire-escrows` already
 * NOTIFIES them, which works for a person with the app installed and does
 * nothing at all for an agent that has crashed. #43 made `refundExpired` and
 * `reclaimAbandoned` permissionless on EVM, so the server can now finish the
 * job the notice only asks for.
 *
 * What it cannot do, by construction: take the money. Both entry points pay
 * `e.creator`, never `msg.sender`. The sweeper's whole power is to make a
 * refund happen SOONER, to an address it does not choose.
 *
 * Deliberately NOT the same scan as the expiry notice. That one uses a bounded
 * `[since, until)` window because a notification is only worth sending while
 * it is news, and a missed window is a missed nudge. A sweep is worth doing
 * whenever it has not happened yet — so this scan is unbounded in age, and its
 * idempotency comes from the escrow LEAVING the sweepable status once the
 * refund confirms, plus a guard against escrows with a transaction already in
 * flight.
 */
import { and, eq, isNull, lt, notExists, isNotNull } from 'drizzle-orm'
import { escrows, tx_attempts } from '@tenda/shared/db/schema'
import type { ChainRegistry, SweepableTransition } from '@server/chains/types'
import type { RecordTxAttemptDeps } from '@server/lib/tx-attempts'
import { recordTxAttempt } from '@server/lib/tx-attempts'
import type { JobPayload } from '@server/plugins/queue'
import type { AppDatabase } from '@server/plugins/db'

// ---------- store abstraction --------------------------------------------

export interface SweepableEscrow {
  id: string
  creator_id: string
  chain_id: string
  /** The contract THIS escrow is pinned to (#89); never the chain's current one. */
  escrow_contract: string
  transition: SweepableTransition
}

export interface SweepEscrowsStore {
  /**
   * Escrows whose recovery window closed at least `delay_ms` ago and which have
   * no transaction in flight.
   *
   * Unbounded in age on purpose (see the file docstring). The delay is the
   * creator's right of first refusal: they were notified when the deadline
   * passed, and spending the platform's gas before they have had a chance to
   * spend their own would be both rude and wasteful.
   */
  findSweepable(args: {
    now: Date
    delay_ms: number
    grace_period_seconds: number
    limit: number
  }): Promise<SweepableEscrow[]>
}

/** No transaction of any kind is in flight for this escrow. */
function noTxInFlight(db: AppDatabase) {
  return notExists(
    db
      .select({ id: tx_attempts.id })
      .from(tx_attempts)
      .where(
        and(
          eq(tx_attempts.escrow_id, escrows.id),
          isNull(tx_attempts.confirmed_at),
          isNull(tx_attempts.failed_at),
        ),
      ),
  )
}

export function drizzleSweepEscrowsStore(db: AppDatabase): SweepEscrowsStore {
  return {
    async findSweepable({ now, delay_ms, grace_period_seconds, limit }) {
      const cutoff = new Date(now.getTime() - delay_ms)
      const columns = {
        id: escrows.id,
        creator_id: escrows.creator_id,
        chain_id: escrows.chain_id,
        escrow_contract: escrows.escrow_contract,
      }

      // Nobody accepted: the listing is dead (the contract refuses an accept
      // past this instant) and the funds are simply stuck.
      const expired = await db
        .select(columns)
        .from(escrows)
        .where(
          and(
            eq(escrows.status, 'open'),
            isNotNull(escrows.escrow_contract),
            lt(escrows.accept_deadline, cutoff),
            noTxInFlight(db),
          ),
        )
        .orderBy(escrows.accept_deadline)
        .limit(limit)

      // Accepted and never delivered. `completion_deadline + grace` is the same
      // boundary at which the worker can no longer submit, folded into the
      // bound in JS so the predicate stays an index-usable column range — the
      // spelling `expire-escrows` already uses for the same sum.
      const graceMs = grace_period_seconds * 1_000
      const abandoned = await db
        .select(columns)
        .from(escrows)
        .where(
          and(
            eq(escrows.status, 'accepted'),
            isNotNull(escrows.escrow_contract),
            lt(escrows.completion_deadline, new Date(cutoff.getTime() - graceMs)),
            noTxInFlight(db),
          ),
        )
        .orderBy(escrows.completion_deadline)
        .limit(limit)

      // `escrow_contract` is filtered NOT NULL above; the narrowing is restated
      // here because Drizzle types the column by its nullability, not by the
      // predicate.
      const rows: SweepableEscrow[] = []
      for (const [transition, found] of [
        ['refund_expired', expired],
        ['reclaim_abandoned', abandoned],
      ] as const) {
        for (const row of found) {
          if (row.escrow_contract === null) continue
          rows.push({ ...row, escrow_contract: row.escrow_contract, transition })
        }
      }
      return rows
    },
  }
}

// ---------- handler -------------------------------------------------------

/** Escrows swept per tick, per transition. A backlog drains across ticks. */
export const SWEEP_BATCH_LIMIT = 50

/**
 * How long after a window closes the creator keeps the first move.
 *
 * They are notified the moment it closes (`jobs/expire-escrows`), and their own
 * refund costs them gas they may prefer to spend themselves — on their own
 * schedule, and in the case of an exchange offer possibly alongside a re-post.
 * A day is long enough that an ordinary person acts first and short enough that
 * an abandoned escrow is not a week-long hostage.
 */
export const SWEEP_FIRST_REFUSAL_MS = 24 * 60 * 60_000

export interface SweepEscrowsLogger {
  info(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
}

export interface SweepEscrowsDeps {
  store: SweepEscrowsStore
  chains: ChainRegistry
  /** Records the attempt and enqueues verification — the same path a user's own refund takes. */
  attempts: RecordTxAttemptDeps
  log: SweepEscrowsLogger
  now(): Date
  /** `platform_config.grace_period_seconds`, resolved by the caller. */
  grace_period_seconds: number
}

export interface SweepEscrowsResult {
  scanned: number
  swept: number
  /** Chains with no sweep capability, or escrows a simulation refused. */
  skipped: number
}

export async function handleSweepEscrows(
  deps: SweepEscrowsDeps,
  payload: JobPayload['sweep-escrows'],
): Promise<SweepEscrowsResult> {
  const rows = await deps.store.findSweepable({
    now: deps.now(),
    delay_ms: SWEEP_FIRST_REFUSAL_MS,
    grace_period_seconds: deps.grace_period_seconds,
    limit: SWEEP_BATCH_LIMIT,
  })

  let swept = 0
  let skipped = 0
  for (const row of rows) {
    // A chain with no relayer float, or one whose program still demands the
    // creator's signature, simply has no sweep port (Solana until #42).
    const sweep = deps.chains.has(row.chain_id) ? deps.chains.get(row.chain_id).sweep : undefined
    if (sweep === undefined) {
      skipped += 1
      continue
    }
    try {
      const { tx_ref } = await sweep.sweep({
        escrow_id: row.id,
        creator_user_id: row.creator_id,
        transition: row.transition,
        escrow_contract: row.escrow_contract,
      })
      await recordTxAttempt(deps.attempts, {
        user_id: row.creator_id,
        escrow_id: row.id,
        action: row.transition,
        tx_ref,
        chain_id: row.chain_id,
        chain_ns: deps.chains.get(row.chain_id).namespace,
        source: 'sweep',
      })
      swept += 1
    } catch (err) {
      // One escrow must never take the tick down: a revert here is ordinary
      // (raced by the creator's own refund, or held by a pre-#43 contract) and
      // the next tick will try again if it is still eligible.
      skipped += 1
      deps.log.warn(
        { err, escrow_id: row.id, chain_id: row.chain_id, transition: row.transition },
        'sweep-escrows: escrow not swept',
      )
    }
  }

  deps.log.info(
    { tick_id: payload.tick_id, scanned: rows.length, swept, skipped },
    'sweep-escrows tick complete',
  )
  return { scanned: rows.length, swept, skipped }
}
