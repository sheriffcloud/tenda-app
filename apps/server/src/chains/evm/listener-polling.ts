/**
 * Self-hosted EVM polling listener, the counterpart of the Solana one
 * (chains/solana/listener-polling) and the fix for the client-ping being the
 * ONLY EVM verification intake: a wallet that broadcasts but never reports
 * (lost WalletConnect response, killed app) previously left the DB diverged
 * from the chain forever. Runs for every configured EVM chain without a
 * webhook secret; enqueued jobs land in the same idempotent verify-tx
 * pipeline (escrow_transactions dedup + status-guarded apply), so replays
 * and client-ping overlaps are harmless.
 *
 * Cursor = last fully-scanned block. Each tick scans
 * (cursor, head − min_confirmations] via address-filtered eth_getLogs in
 * bounded ranges, so a fresh deploy backfills recent history across a few
 * ticks without ever issuing an unbounded query. The confirmation lag keeps
 * enqueued hashes past the adapter's depth check (fewer retry loops) and out
 * of shallow reorgs; reverted txs emit no logs, so only real state changes
 * surface — failed txs stay covered by the client-ping + reconcile path.
 */

import type { EvmRpc } from '@server/chains/evm/rpc'
import type { CursorStore } from '@server/chains/cursors'
import { createIntervalListener } from '@server/chains/interval-listener'
import type { ChainId, ChainListener } from '@server/chains/types'
import type { QueueService } from '@server/plugins/queue'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'

// ---------- policy constants ---------------------------------------------

/** Same cadence as the Solana listener; block time never beats it usefully. */
export const EVM_POLL_INTERVAL_MS = 15_000

/**
 * Per-endpoint RPC timeout for the listener's OWN client. The default
 * createEvmRpc budgets (6s per endpoint with a fallback) are tuned for the
 * interactive tx-build path; a background poller has no user waiting, and on
 * a high-latency link a 6s cap makes heavier eth_getLogs calls fail
 * spuriously (observed: ~4s for a bare eth_blockNumber). Failures only cost
 * a retried tick, but a generous cap keeps them rare.
 */
export const EVM_LISTENER_RPC_TIMEOUT_MS = 30_000

/**
 * Blocks per eth_getLogs call: the lowest cap among the providers we target.
 * Alchemy's FREE tier rejects ranges over 10 blocks (verified live,
 * -32600 "up to a 10 block range" on Base Sepolia) — larger ranges silently
 * shunted every call onto the fallback endpoint, making the fallback the
 * de-facto primary. Steady state produces ~8 Base blocks per 15s tick, so
 * one call usually covers it; raise this only alongside a paid tier.
 */
export const EVM_GETLOGS_MAX_RANGE = 10n

/**
 * Ranges per tick: bounds a tick's RPC work; deep catch-up spans ticks.
 * 20 × 10 blocks = 200 blocks/tick (~25× Base's production rate), so outages
 * recover quickly while a deploy-block backfill self-paces (~45k blocks in
 * under an hour) without ever bursting past free-tier rate limits.
 */
export const EVM_MAX_RANGES_PER_TICK = 20

/**
 * First-run lookback when the chain's ESCROW_DEPLOY_BLOCK secret is unset
 * (the deploy block is the exact start — no event can predate the contract).
 * 200k blocks ≈ 4½ days on a 2s-block L2 (Base): a bounded recency net, but
 * anything older stays unscanned, hence the boot warning when relying on it.
 */
export const EVM_BACKFILL_BLOCKS = 200_000n

// ---------- tick (the testable unit) -----------------------------------------

export interface EvmPollTickDeps {
  rpc: Pick<EvmRpc, 'getBlockNumber' | 'getLogRefs'>
  chain_id: ChainId
  /**
   * Every escrow contract this chain has run, current included.
   *
   * Watching only the current one is what made a redeploy silently drop the
   * safety net under every escrow still funded by its predecessor: their events
   * stopped being seen at all, so a lost client-ping had nothing to recover it
   * (open_issues #89). Over-inclusion is the safe direction here — an extra
   * address costs nothing, a missing one diverges quietly.
   */
  escrow_contracts: readonly `0x${string}`[]
  /**
   * Block the escrow contract was deployed at (chain secret). When present,
   * a first run (cursor 0) starts EXACTLY here — full event history, no
   * arbitrary window; absent falls back to EVM_BACKFILL_BLOCKS.
   */
  deploy_block?: number
  /** Manifest minConfirmations for this chain; the scan stays this far behind head. */
  min_confirmations: number
  cursors: CursorStore
  queue: Pick<QueueService, 'enqueue'>
  log: {
    info(obj: Record<string, unknown>, msg: string): void
    warn(obj: Record<string, unknown>, msg: string): void
  }
}

export interface EvmPollTickResult {
  ranges: number
  logs: number
  enqueued: number
  cursor: number
}

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b)
const max = (a: bigint, b: bigint): bigint => (a > b ? a : b)

export async function evmPollTick(deps: EvmPollTickDeps): Promise<EvmPollTickResult> {
  const cursor = BigInt(await deps.cursors.getCursor(deps.chain_id))
  const head = await deps.rpc.getBlockNumber()
  const safeHead = head - BigInt(deps.min_confirmations)

  // First run (no cursor): start at the contract's deploy block when known
  // (exact history), else a bounded recency lookback — never a genesis scan.
  const firstRunStart =
    deps.deploy_block !== undefined
      ? BigInt(deps.deploy_block)
      : max(1n, safeHead - EVM_BACKFILL_BLOCKS + 1n)
  let from = cursor === 0n ? firstRunStart : cursor + 1n

  const result: EvmPollTickResult = { ranges: 0, logs: 0, enqueued: 0, cursor: Number(cursor) }
  while (from <= safeHead && result.ranges < EVM_MAX_RANGES_PER_TICK) {
    const to = min(from + EVM_GETLOGS_MAX_RANGE - 1n, safeHead)
    const refs = await deps.rpc.getLogRefs(deps.escrow_contracts, from, to)
    result.ranges += 1
    result.logs += refs.length

    // One tx can emit several escrow logs; enqueue each hash once, in block
    // order so an enqueue failure leaves the cursor behind the gap.
    const seen = new Set<string>()
    for (const ref of refs) {
      if (seen.has(ref.tx_hash)) continue
      seen.add(ref.tx_hash)
      try {
        await deps.queue.enqueue(
          'verify-tx',
          { chain_id: deps.chain_id, tx_ref: ref.tx_hash, source: 'polling' },
          {
            job_id: verifyTxDedupKey({
              chain_id: deps.chain_id,
              tx_ref: ref.tx_hash,
              event: 'Any',
            }),
          },
        )
        result.enqueued += 1
      } catch (err) {
        // Queue down: advance only to the block BEFORE this tx (a same-block
        // sibling that already enqueued re-enqueues next tick — the job-id
        // dedup absorbs it), then abort the tick; the next one retries here.
        deps.log.warn({ err, tx_ref: ref.tx_hash }, 'evm polling: enqueue failed, tick aborted')
        const lastGood = ref.block_number - 1n
        if (lastGood > BigInt(result.cursor)) {
          await deps.cursors.setCursor(deps.chain_id, Number(lastGood))
          result.cursor = Number(lastGood)
        }
        return result
      }
    }

    await deps.cursors.setCursor(deps.chain_id, Number(to))
    result.cursor = Number(to)
    from = to + 1n
  }
  return result
}

// ---------- listener -----------------------------------------------------------

export function createEvmPollingListener(
  deps: EvmPollTickDeps & { interval_ms?: number },
): ChainListener {
  return createIntervalListener({
    chain_id: deps.chain_id,
    interval_ms: deps.interval_ms ?? EVM_POLL_INTERVAL_MS,
    tick: () => evmPollTick(deps),
    log: deps.log,
  })
}
