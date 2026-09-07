/**
 * Client-ping intake: record a submitted tx in the `tx_attempts` audit log
 * and (best-effort) enqueue verification.
 *
 * Idempotency: `tx_attempts.tx_ref` is UNIQUE, replays no-op the insert
 * and re-enqueue (the verify-tx job id is deterministic, so the queue
 * layer dedups too). Until #33 provisions Redis the queue stub throws; the
 * attempt row is still recorded and the Stage-2 reconciliation cron sweeps
 * pending rows, so a dead queue degrades to slower verification, never to
 * a lost transaction.
 */

import { tx_attempts } from '@tenda/shared/db/schema'
import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import { dedupKey } from '@server/core/queue/idempotency'
import type { AppDatabase } from '@server/plugins/db'
import type { QueueService } from '@server/plugins/queue'
import { EVENT_BY_TX_TYPE, type EscrowTxType } from '@server/chains/types'

// ---------- store abstraction --------------------------------------------

export interface TxAttemptRow {
  user_id: string
  escrow_id: string | null
  action: EscrowTxType
  tx_ref: string
}

export interface TxAttemptsStore {
  /** Insert; returns false when tx_ref already exists (idempotent replay). */
  insertAttempt(row: TxAttemptRow): Promise<boolean>
}

export function drizzleTxAttemptsStore(db: AppDatabase): TxAttemptsStore {
  return {
    async insertAttempt(row) {
      const inserted = await db
        .insert(tx_attempts)
        .values(row)
        .onConflictDoNothing({ target: tx_attempts.tx_ref })
        .returning({ id: tx_attempts.id })
      return inserted.length > 0
    },
  }
}

// ---------- intake ---------------------------------------------------------

export interface RecordTxAttemptInput extends TxAttemptRow {
  chain_id: string
  chain_ns: ChainNamespace
}

export interface RecordTxAttemptDeps {
  store: TxAttemptsStore
  queue: Pick<QueueService, 'enqueue'>
  log: { warn(obj: Record<string, unknown>, msg: string): void }
}

export interface RecordTxAttemptResult {
  /** False when the tx_ref was already recorded (idempotent replay). */
  recorded: boolean
  /** False when the queue is unavailable (reconciliation will sweep). */
  enqueued: boolean
}

export async function recordTxAttempt(
  deps: RecordTxAttemptDeps,
  input: RecordTxAttemptInput,
): Promise<RecordTxAttemptResult> {
  const recorded = await deps.store.insertAttempt({
    user_id: input.user_id,
    escrow_id: input.escrow_id,
    action: input.action,
    tx_ref: input.tx_ref,
  })

  const expected_event = EVENT_BY_TX_TYPE[input.action]
  let enqueued = false
  try {
    await deps.queue.enqueue(
      'verify-tx',
      {
        chain_id: input.chain_id,
        tx_ref: input.tx_ref,
        expected_event,
        ...(input.escrow_id !== null ? { escrow_id: input.escrow_id } : {}),
        source: 'client-hint',
      },
      {
        job_id: dedupKey({
          chain_ns: input.chain_ns,
          tx_ref: input.tx_ref,
          event: expected_event,
        }),
      },
    )
    enqueued = true
  } catch (err) {
    // Queue stub (pre-#33) or transient Redis failure, the pending
    // tx_attempts row is the durable record; reconciliation sweeps it.
    deps.log.warn(
      { err, tx_ref: input.tx_ref, action: input.action },
      'verify-tx enqueue unavailable, relying on reconciliation sweep',
    )
  }

  return { recorded, enqueued }
}
