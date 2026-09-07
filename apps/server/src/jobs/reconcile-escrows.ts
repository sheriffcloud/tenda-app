/**
 * reconcile-escrows repeatable job (stage-2-listeners.md § Reconciliation
 * cron, every 5 min): the safety net under webhooks and client pings.
 *
 * Scans pending `tx_attempts` (no confirmed_at / failed_at) older than the
 * probe delay, probes the chain directly, and:
 *   - confirmed (success OR failure) → enqueue the idempotent verify-tx
 *     job, one code path applies state / marks failures, never two.
 *   - still unknown past the give-up horizon → failed_at = TIMEOUT.
 *
 * Chain resolution: tx_attempts has no chain column by design; the row
 * joins through its escrow. Attempts without an escrow hint (create pings
 * that never landed) fall back to the deployment's single registered chain
 *, revisit when Stage 3 registers a second chain.
 */

import { and, isNull, lt, sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { escrows, tx_attempts } from '@tenda/shared/db/schema/escrow'
import { EVENT_BY_TX_TYPE, type ChainRegistry, type EscrowTxType } from '@server/chains/types'
import type { AppDatabase } from '@server/plugins/db'
import type { JobPayload, QueueService } from '@server/plugins/queue'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'

// ---------- policy constants ---------------------------------------------

/** Don't probe attempts younger than this, the normal path is still live. */
export const RECONCILE_MIN_AGE_MS = 5 * 60_000
/** Unknown on chain past this age → failed_at = TIMEOUT (blockhash expired). */
export const RECONCILE_GIVE_UP_MS = 30 * 60_000
/** Rows per tick; overflow is logged and swept next tick. */
export const RECONCILE_BATCH_LIMIT = 100

export const RECONCILE_TIMEOUT_CODE = 'TIMEOUT'

// ---------- store seam ------------------------------------------------------

export interface PendingAttempt {
  tx_ref: string
  action: EscrowTxType
  escrow_id: string | null
  /** From the escrow row; null when the attempt has no escrow hint. */
  chain_id: string | null
  submitted_at: Date
}

export interface ReconcileStore {
  findPendingAttempts(olderThan: Date, limit: number): Promise<PendingAttempt[]>
  markAttemptFailed(tx_ref: string, failure_code: string): Promise<void>
}

export function drizzleReconcileStore(db: AppDatabase): ReconcileStore {
  return {
    async findPendingAttempts(olderThan, limit) {
      const rows = await db
        .select({
          tx_ref: tx_attempts.tx_ref,
          action: tx_attempts.action,
          escrow_id: tx_attempts.escrow_id,
          chain_id: escrows.chain_id,
          submitted_at: tx_attempts.submitted_at,
        })
        .from(tx_attempts)
        .leftJoin(escrows, eq(tx_attempts.escrow_id, escrows.id))
        .where(
          and(
            isNull(tx_attempts.confirmed_at),
            isNull(tx_attempts.failed_at),
            lt(tx_attempts.submitted_at, olderThan),
          ),
        )
        .orderBy(sql`${tx_attempts.submitted_at} ASC`)
        .limit(limit)
      return rows
    },
    async markAttemptFailed(tx_ref, failure_code) {
      await db
        .update(tx_attempts)
        .set({ failed_at: new Date(), failure_code })
        .where(eq(tx_attempts.tx_ref, tx_ref))
    },
  }
}

// ---------- handler ------------------------------------------------------------

export interface ReconcileDeps {
  store: ReconcileStore
  chains: ChainRegistry
  queue: Pick<QueueService, 'enqueue'>
  log: {
    info(obj: Record<string, unknown>, msg: string): void
    warn(obj: Record<string, unknown>, msg: string): void
  }
  now(): Date
}

export interface ReconcileResult {
  scanned: number
  enqueued: number
  timed_out: number
  still_pending: number
}

export async function reconcileEscrowsHandler(
  deps: ReconcileDeps,
  payload: JobPayload['reconcile'],
): Promise<ReconcileResult> {
  const now = deps.now()
  const olderThan = new Date(now.getTime() - RECONCILE_MIN_AGE_MS)
  const pending = await deps.store.findPendingAttempts(olderThan, RECONCILE_BATCH_LIMIT)

  const result: ReconcileResult = {
    scanned: pending.length,
    enqueued: 0,
    timed_out: 0,
    still_pending: 0,
  }

  for (const attempt of pending) {
    const chain_id = attempt.chain_id ?? deps.chains.list()[0]?.chain_id
    if (chain_id === undefined) {
      deps.log.warn({ tx_ref: attempt.tx_ref }, 'reconcile: no chain to probe, skipping')
      result.still_pending += 1
      continue
    }
    const adapter = deps.chains.get(chain_id)
    const expected_event = EVENT_BY_TX_TYPE[attempt.action]

    let confirmed: boolean
    try {
      const probe = await adapter.verifyTx(attempt.tx_ref, {
        expected_event,
        ...(attempt.escrow_id !== null ? { escrow_id: attempt.escrow_id } : {}),
      })
      confirmed = probe.confirmed
    } catch (err) {
      // RPC trouble, leave the row pending; next tick retries.
      deps.log.warn({ err, tx_ref: attempt.tx_ref }, 'reconcile: probe failed')
      result.still_pending += 1
      continue
    }

    if (confirmed) {
      // Confirmed in EITHER direction (success or execution failure): the
      // verify-tx job is the single application path; enqueue idempotently.
      try {
        await deps.queue.enqueue(
          'verify-tx',
          {
            chain_id,
            tx_ref: attempt.tx_ref,
            expected_event,
            ...(attempt.escrow_id !== null ? { escrow_id: attempt.escrow_id } : {}),
            source: 'reconcile',
          },
          { job_id: verifyTxDedupKey({ chain_id, tx_ref: attempt.tx_ref, event: expected_event }) },
        )
        result.enqueued += 1
      } catch (err) {
        deps.log.warn({ err, tx_ref: attempt.tx_ref }, 'reconcile: enqueue failed')
        result.still_pending += 1
      }
      continue
    }

    if (now.getTime() - attempt.submitted_at.getTime() >= RECONCILE_GIVE_UP_MS) {
      await deps.store.markAttemptFailed(attempt.tx_ref, RECONCILE_TIMEOUT_CODE)
      result.timed_out += 1
    } else {
      result.still_pending += 1
    }
  }

  if (pending.length === RECONCILE_BATCH_LIMIT) {
    deps.log.warn(
      { window: payload, limit: RECONCILE_BATCH_LIMIT },
      'reconcile: batch limit hit, remainder swept next tick',
    )
  }
  deps.log.info({ ...result }, 'reconcile tick complete')
  return result
}
