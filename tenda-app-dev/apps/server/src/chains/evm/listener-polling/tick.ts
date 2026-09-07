/**
 * The EVM polling tick: scan the chain for escrow logs and hand each tx to the
 * idempotent verify-tx pipeline.
 *
 * TWO CURSORS, newest-first (#35). The single-cursor version started at the
 * contract's deploy block and walked FORWARD, so on a fast chain it spent hours
 * scanning history while live escrows went unseen — a safety net processing the
 * past before the present, which is no net at all during the window it is most
 * needed. MEASURED on Galileo: the cursor sat 287,832 blocks behind head, and a
 * real EscrowAccepted (block 52006941) stayed invisible to the app while the
 * gig was still advertised open.
 *
 *   LIVE     (`cursors.getCursor`)         — pinned just behind head. Runs
 *                                            FIRST every tick and only has to
 *                                            cover what the chain produced in
 *                                            the last interval, so lag is one
 *                                            tick regardless of history.
 *   HISTORY  (`cursors.getBackfillCursor`)  — walks forward from the deploy
 *                                            block toward the live cursor with
 *                                            whatever budget is left.
 *
 * The budget is UNCHANGED: `EVM_MAX_RANGES_PER_TICK` calls per tick, split
 * rather than added to, at the same interval. On Galileo the live window is
 * ~31 blocks per tick = 4 of the 20 calls, leaving 16 for history. Same spend,
 * different order. History closes ~6% slower than before because it no longer
 * gets the whole budget; live lag drops from hours to one tick.
 *
 * No block is skipped: history covers (backfill, liveStart] and live covers
 * (liveStart, safeHead]. They close on each other — history gains on live
 * every tick — and a small overlap at the seam is harmless, because enqueues
 * are deduped by `verifyTxDedupKey` and the pipeline is idempotent
 * (escrow_transactions dedup + status-guarded apply).
 */

import type { EvmRpc } from '@server/chains/evm/rpc'
import type { CursorStore } from '@server/chains/cursors'
import type { ChainId } from '@server/chains/types'
import type { QueueService } from '@server/plugins/queue'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'
import {
  EVM_BACKFILL_BLOCKS,
  EVM_GETLOGS_MAX_RANGE,
  EVM_MAX_RANGES_PER_TICK,
} from './constants'

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
   * history starts EXACTLY here — full event history, no arbitrary window;
   * absent falls back to EVM_BACKFILL_BLOCKS.
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
  /** Live cursor after the tick — what bounds staleness. */
  cursor: number
  /** History cursor after the tick. */
  backfill_cursor: number
  /**
   * Blocks of history still unscanned. 0 means the two cursors have met and
   * the listener is back to a single moving position. Reported so the gap is
   * OBSERVABLE rather than inferred from a stalled cursor.
   */
  backfill_remaining: number
  /** Chain head at the time of the tick, for the same reason. */
  head: number
}

const min = (a: bigint, b: bigint): bigint => (a < b ? a : b)
const max = (a: bigint, b: bigint): bigint => (a > b ? a : b)

/** A scan's outcome: where it got to, how much budget it spent, and whether it stopped early. */
interface ScanOutcome {
  /** Last fully-scanned block. Equals `from - 1` when nothing was scanned. */
  cursor: bigint
  /** Ranges actually queried, which is what the other cursor's budget is docked by. */
  ranges: number
  /**
   * TRUE only when an enqueue failed. Running out of budget is NOT an abort —
   * that is the normal way a deep scan paces itself across ticks, and treating
   * it as a failure would stop the other cursor from spending what is left.
   */
  aborted: boolean
}

/**
 * Scan (from−1, to] in `EVM_GETLOGS_MAX_RANGE` steps, enqueueing each distinct
 * tx hash, and report where it got to. Shared by both cursors so the live and
 * history paths cannot drift in how they page, dedup or handle an enqueue
 * failure — the one thing that must be identical between them.
 */
async function scanRange(
  deps: EvmPollTickDeps,
  args: { from: bigint; to: bigint; budget: number; result: EvmPollTickResult },
): Promise<ScanOutcome> {
  let from = args.from
  let cursor = from - 1n
  let ranges = 0

  while (from <= args.to && ranges < args.budget) {
    const to = min(from + EVM_GETLOGS_MAX_RANGE - 1n, args.to)
    const refs = await deps.rpc.getLogRefs(deps.escrow_contracts, from, to)
    ranges += 1
    args.result.ranges += 1
    args.result.logs += refs.length

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
        args.result.enqueued += 1
      } catch (err) {
        // Queue down: stop at the block BEFORE this tx (a same-block sibling
        // that already enqueued re-enqueues next tick — the job-id dedup
        // absorbs it) and abort, so the next tick retries from here.
        deps.log.warn({ err, tx_ref: ref.tx_hash }, 'evm polling: enqueue failed, scan aborted')
        return { cursor: max(cursor, ref.block_number - 1n), ranges, aborted: true }
      }
    }

    cursor = to
    from = to + 1n
  }
  return { cursor, ranges, aborted: false }
}

/**
 * Where history starts on a chain that has never recorded one: the deploy
 * block when the secret gives it (exact — no event can predate the contract),
 * else a bounded recency window rather than a genesis scan.
 */
function historyStart(deps: EvmPollTickDeps, safeHead: bigint): bigint {
  return deps.deploy_block !== undefined
    ? BigInt(deps.deploy_block)
    : max(1n, safeHead - EVM_BACKFILL_BLOCKS + 1n)
}

export async function evmPollTick(deps: EvmPollTickDeps): Promise<EvmPollTickResult> {
  const head = await deps.rpc.getBlockNumber()
  const safeHead = head - BigInt(deps.min_confirmations)
  // FLOORED AT 0, on read and on adoption alike (see below). A block ordinal is
  // unsigned, and a negative one is not merely wrong — viem refuses to encode it
  // (`IntegerOutOfRangeError: Number "-2n" is not in safe integer range`), so
  // every subsequent tick throws before it can reach the RPC and the listener
  // retries the same poisoned cursor for the life of the process.
  let live = max(0n, BigInt(await deps.cursors.getCursor(deps.chain_id)))
  const storedBackfill = await deps.cursors.getBackfillCursor(deps.chain_id)
  let backfill = storedBackfill === null ? null : BigInt(storedBackfill)

  // ADOPTION (runs once per chain). A NULL history cursor means this chain has
  // never split its scan — either brand new, or a deployment upgrading from the
  // single-cursor version mid-walk. Both are the same rule: whatever that one
  // cursor reached IS how far history is scanned, and live jumps to head so it
  // starts covering the present immediately. A deployment that had already
  // caught up adopts `backfill = live ≈ safeHead`, which reads as "history
  // complete" on the very next line — no rescan.
  //
  // ONE write, and NULL rather than a 0 sentinel, because both shortcuts had
  // the same failure: a state that reads as "never initialised" while live
  // already sits at head makes the next tick adopt live and declare every
  // unscanned block covered. Two upserts left exactly that state whenever the
  // process died between them (measured: 400,000 blocks silently dropped), and
  // a 0 sentinel produced it without any crash on a chain whose history starts
  // at block 1, as soon as a history scan failed to advance past its first
  // block. `initCursors` is all-or-nothing, and NULL cannot be written back.
  if (backfill === null) {
    backfill = live > 0n ? live : historyStart(deps, safeHead) - 1n
    // `safeHead` is head MINUS the confirmation depth, so on a chain with fewer
    // blocks than it confirms — a fresh node, or one just reset — it is
    // NEGATIVE. The single-cursor version could not store that (it floored its
    // start at block 1 and never advanced past `safeHead`); pinning live to
    // head directly can, and the value it writes is durable. Floor it here, at
    // the same 0 the history walk already floors to.
    live = max(0n, safeHead)
    await deps.cursors.initCursors(deps.chain_id, {
      live: Number(live),
      backfill: Number(backfill),
    })
  }

  const liveStart = live
  const backfillAtStart = backfill
  const result: EvmPollTickResult = {
    ranges: 0,
    logs: 0,
    enqueued: 0,
    cursor: Number(live),
    backfill_cursor: Number(backfill),
    backfill_remaining: Number(max(0n, liveStart - backfill)),
    head: Number(head),
  }

  // 1. LIVE FIRST — always, and with the whole budget available to it. This
  //    ordering is the fix: whatever else happens this tick, the newest blocks
  //    are scanned.
  const liveScan = await scanRange(deps, {
    from: live + 1n,
    to: safeHead,
    budget: EVM_MAX_RANGES_PER_TICK,
    result,
  })
  if (liveScan.cursor > live) {
    live = liveScan.cursor
    await deps.cursors.setCursor(deps.chain_id, Number(live))
    result.cursor = Number(live)
  }
  // 2. HISTORY with what is left. Its ceiling is where LIVE started this tick,
  //    never `safeHead` — the blocks above that are live's, and scanning them
  //    twice would waste the budget history needs to converge.
  //
  //    Skipped when live aborted: the queue is down, so history's first enqueue
  //    would meet the same failure. The tick does NOT return here, though —
  //    everything below still runs, because an aborted live scan must not leave
  //    a history that was already complete looking incomplete again.
  if (!liveScan.aborted) {
    const remaining = EVM_MAX_RANGES_PER_TICK - liveScan.ranges
    if (backfill < liveStart && remaining > 0) {
      const historyScan = await scanRange(deps, {
        from: backfill + 1n,
        to: liveStart,
        budget: remaining,
        result,
      })
      backfill = max(backfill, historyScan.cursor)
    }
  }

  // COMPLETION, tested after the scan and not only before it, and on EVERY
  // path including an aborted one. History is done the moment it reaches where
  // live began — including when it got there during the scan just above.
  // Pinning it to live keeps that true as live advances; without this the gap
  // reopens by one tick's blocks every tick and history rescans exactly what
  // live already covered. (Caught by '#35 when history catches up it stays
  // pinned to live' and, for the abort path, by '#35 an aborted live scan
  // leaves a complete history pinned'.)
  if (backfill >= liveStart) backfill = max(backfill, live)

  if (backfill !== backfillAtStart) {
    await deps.cursors.setBackfillCursor(deps.chain_id, Number(backfill))
    result.backfill_cursor = Number(backfill)
  }

  // Outstanding history is measured against where LIVE BEGAN, never where it
  // ended: the blocks above liveStart are live's own work this tick, and
  // counting them as history's would report a gap that does not exist.
  result.backfill_remaining = Number(max(0n, liveStart - backfill))
  return result
}
