/**
 * Self-hosted Solana polling listener (stage-2-listeners.md): the fallback
 * that runs when the Solana chain's WEBHOOK_SECRET is unset (Helius down or
 * unconfigured).
 *
 * Each tick fetches recent program signatures, enqueues idempotent verify-tx
 * jobs for those in slots beyond the cursor (chains/cursors), then advances
 * the cursor to the highest slot seen.
 *
 * Cursor boundary: signatures landing later in the SAME slot as the cursor
 * can be skipped by the strict `slot > cursor` filter, accepted, because
 * the reconciliation sweep catches anything a tick misses (defence in
 * depth is the design, not single-pass perfection).
 */

import { PROGRAM_ID } from '@server/chains/solana/pdas'
import type { SolanaRpc } from '@server/chains/solana/rpc'
import type { CursorStore } from '@server/chains/cursors'
import { createIntervalListener } from '@server/chains/interval-listener'
import type { ChainId, ChainListener } from '@server/chains/types'
import type { QueueService } from '@server/plugins/queue'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'

// ---------- policy constants ---------------------------------------------

export const POLL_INTERVAL_MS = 15_000
export const POLL_SIGNATURE_LIMIT = 100

/**
 * Per-endpoint RPC timeout for the listener's OWN client. The default
 * createSolanaRpc budgets (6s per endpoint with a fallback) are tuned for the
 * interactive tx-build path; a background poller has no user waiting, and a
 * tight cap makes heavier getSignaturesForAddress calls fail spuriously on a
 * high-latency link. Failures only cost a retried tick, but a generous cap
 * keeps them rare. Mirrors EVM_LISTENER_RPC_TIMEOUT_MS.
 */
export const SOLANA_LISTENER_RPC_TIMEOUT_MS = 30_000

// ---------- tick (the testable unit) -----------------------------------------

export interface PollTickDeps {
  rpc: SolanaRpc
  chain_id: ChainId
  cursors: CursorStore
  queue: Pick<QueueService, 'enqueue'>
  log: {
    info(obj: Record<string, unknown>, msg: string): void
    warn(obj: Record<string, unknown>, msg: string): void
  }
}

export interface PollTickResult {
  fetched: number
  enqueued: number
  cursor: number
}

export async function pollTick(deps: PollTickDeps): Promise<PollTickResult> {
  const cursor = await deps.cursors.getCursor(deps.chain_id)
  const signatures = await deps.rpc.getSignaturesForAddress(PROGRAM_ID.toBase58(), {
    limit: POLL_SIGNATURE_LIMIT,
  })

  const fresh = signatures.filter((s) => s.slot > cursor)
  let enqueued = 0
  // Oldest first so a mid-batch failure leaves the cursor behind the gap.
  for (const s of [...fresh].sort((a, b) => a.slot - b.slot)) {
    try {
      await deps.queue.enqueue(
        'verify-tx',
        { chain_id: deps.chain_id, tx_ref: s.signature, source: 'polling' },
        {
          job_id: verifyTxDedupKey({
            chain_id: deps.chain_id,
            tx_ref: s.signature,
            event: 'Any',
          }),
        },
      )
      enqueued += 1
    } catch (err) {
      // Queue down: stop the tick WITHOUT advancing the cursor past this
      // signature, the next tick retries from here.
      deps.log.warn({ err, signature: s.signature }, 'polling: enqueue failed, tick aborted')
      const lastGood = s.slot - 1
      if (lastGood > cursor) await deps.cursors.setCursor(deps.chain_id, lastGood)
      return { fetched: signatures.length, enqueued, cursor: Math.max(cursor, lastGood) }
    }
  }

  const maxSlot = fresh.reduce((m, s) => Math.max(m, s.slot), cursor)
  if (maxSlot > cursor) await deps.cursors.setCursor(deps.chain_id, maxSlot)
  return { fetched: signatures.length, enqueued, cursor: maxSlot }
}

// ---------- listener -----------------------------------------------------------

export function createSolanaPollingListener(
  deps: PollTickDeps & { interval_ms?: number },
): ChainListener {
  return createIntervalListener({
    chain_id: deps.chain_id,
    interval_ms: deps.interval_ms ?? POLL_INTERVAL_MS,
    tick: () => pollTick(deps),
    log: deps.log,
  })
}
