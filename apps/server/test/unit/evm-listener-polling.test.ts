/**
 * chains/evm/listener-polling — block-cursor tick: bounded backfill on first
 * run, chunked ranges with the per-tick cap, per-tx-hash dedup inside a range,
 * confirmation lag, cursor advance per completed range, and the
 * abort-without-advance contract when the queue dies mid-batch.
 */

import { fakeCursorStore, type FakeCursorStore } from '../helpers/cursor-store'
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  evmPollTick,
  createEvmPollingListener,
  EVM_BACKFILL_BLOCKS,
  EVM_GETLOGS_MAX_RANGE,
  EVM_LIVE_LAG_WARN_BLOCKS,
  EVM_MAX_RANGES_PER_TICK,
  EVM_POLL_INTERVAL_MS,
  type EvmPollTickDeps,
} from '@server/chains/evm/listener-polling'
import type { EvmLogRef } from '@server/chains/evm/rpc'

const CONTRACT = '0x9d0193f7000000000000000000000000000000c3' as const
const CHAIN_ID = 'eip155:84532'

function ref(tx: string, block: bigint): EvmLogRef {
  return { tx_hash: `0x${tx.repeat(2).padEnd(64, '0')}` as `0x${string}`, block_number: block }
}

function makeDeps(opts: {
  cursor?: number
  /**
   * History cursor. Defaults to `cursor` — history already complete (#35) —
   * except on a fresh chain (`cursor: 0`), where it defaults to `null`: the
   * UNINITIALISED value a row that has never been written holds. Pass `null`
   * explicitly to put a chain that HAS a live cursor into that state, which is
   * what a pre-#35 deployment looks like on the tick after it upgrades.
   */
  backfill?: number | null
  head: bigint
  deploy_block?: number
  min_confirmations?: number
  /** Staged logs; served to every getLogRefs call unless perRange is set. */
  logs?: EvmLogRef[]
  /** Optional per-call responses, consumed in order (chunking tests). */
  perRange?: EvmLogRef[][]
  /** Watch set; defaults to the single current contract. */
  escrow_contracts?: readonly `0x${string}`[]
  enqueueFailsAt?: string
}): {
  deps: EvmPollTickDeps
  cursors: FakeCursorStore
  calls: {
    enqueued: string[]
    cursors: readonly number[]
    ranges: Array<[bigint, bigint]>
    watched: Array<readonly string[]>
  }
} {
  // `backfill` defaults to the same block as `live` so these long-standing
  // cases keep testing the LIVE scan in isolation: equal cursors mean history
  // is already complete, which is the steady state every pre-#35 test assumed.
  // A fresh chain has no history cursor at all, so it defaults to null.
  const defaultBackfill = opts.cursor !== undefined && opts.cursor > 0 ? opts.cursor : null
  const cursors = fakeCursorStore({
    live: opts.cursor ?? 0,
    backfill: opts.backfill !== undefined ? opts.backfill : defaultBackfill,
  })
  const calls = {
    enqueued: [] as string[],
    /** Live-cursor writes, the ordinal these suites have always asserted on. */
    cursors: cursors.live,
    ranges: [] as Array<[bigint, bigint]>,
    /** Address set passed to each getLogRefs call, to prove it is ONE call. */
    watched: [] as Array<readonly string[]>,
  }
  let rangeIndex = 0
  const deps: EvmPollTickDeps = {
    rpc: {
      async getBlockNumber() {
        return opts.head
      },
      async getLogRefs(contracts, from, to) {
        calls.ranges.push([from, to])
        calls.watched.push([...contracts])
        if (opts.perRange !== undefined) return opts.perRange[rangeIndex++] ?? []
        // Serve only the staged logs inside the queried window.
        return (opts.logs ?? []).filter((l) => l.block_number >= from && l.block_number <= to)
      },
    },
    chain_id: CHAIN_ID,
    escrow_contracts: opts.escrow_contracts ?? [CONTRACT],
    ...(opts.deploy_block !== undefined ? { deploy_block: opts.deploy_block } : {}),
    min_confirmations: opts.min_confirmations ?? 5,
    cursors,
    queue: {
      async enqueue(_name, payload) {
        const p = payload as { tx_ref: string }
        if (p.tx_ref === opts.enqueueFailsAt) throw new Error('redis down')
        calls.enqueued.push(p.tx_ref)
        return { job_id: 'x' }
      },
    },
    log: { info() {}, warn() {} },
  }
  return { deps, calls, cursors }
}

test('scans (cursor, head − confirmations] in capped ranges and advances the cursor', async () => {
  const logA = ref('aa', 150n)
  const logB = ref('bb', 190n)
  const { deps, calls } = makeDeps({ cursor: 100, head: 205n, logs: [logA, logB] })

  const result = await evmPollTick(deps)

  // Window is (100, 200] (head 205 − 5 confirmations), covered contiguously
  // from 101 in ranges no wider than the per-call cap.
  assert.equal(calls.ranges[0][0], 101n)
  assert.equal(calls.ranges[calls.ranges.length - 1][1], 200n)
  for (const [from, to] of calls.ranges) assert.ok(to - from + 1n <= EVM_GETLOGS_MAX_RANGE)
  assert.deepEqual(calls.enqueued, [logA.tx_hash, logB.tx_hash])
  assert.equal(calls.cursors[calls.cursors.length - 1], 200)
  assert.equal(result.enqueued, 2)
  assert.equal(result.logs, 2)
  assert.equal(result.cursor, 200)
})

test('a multi-log transaction is enqueued exactly once', async () => {
  const sameTx = ref('cc', 150n)
  const { deps, calls } = makeDeps({ cursor: 100, head: 205n, logs: [sameTx, { ...sameTx }] })

  const result = await evmPollTick(deps)

  assert.deepEqual(calls.enqueued, [sameTx.tx_hash])
  assert.equal(result.logs, 2)
  assert.equal(result.enqueued, 1)
})

test('caught up: no getLogs call, no cursor write', async () => {
  const { deps, calls } = makeDeps({ cursor: 200, head: 205n })

  const result = await evmPollTick(deps)

  assert.deepEqual(calls.ranges, [])
  assert.deepEqual(calls.cursors, [])
  assert.deepEqual(result, {
    ranges: 0, logs: 0, enqueued: 0, cursor: 200,
    backfill_cursor: 200, backfill_remaining: 0, head: 205,
  })
})

test('head within the confirmation lag of the cursor is a no-op (never scans unconfirmed blocks)', async () => {
  const { deps, calls } = makeDeps({ cursor: 200, head: 204n, min_confirmations: 5 })

  await evmPollTick(deps)

  assert.deepEqual(calls.ranges, [])
  assert.deepEqual(calls.cursors, [])
})

test('first run backfills a bounded window, never from genesis', async () => {
  const head = 500_000n
  const { deps, calls, cursors } = makeDeps({ cursor: 0, head, perRange: [[], [], [], [], []] })

  await evmPollTick(deps)

  const safeHead = head - 5n
  const expectedStart = safeHead - EVM_BACKFILL_BLOCKS + 1n
  assert.equal(calls.ranges[0][0], expectedStart)
  // Ranges are chunked and capped per tick.
  assert.equal(calls.ranges.length, EVM_MAX_RANGES_PER_TICK)
  for (const [from, to] of calls.ranges) {
    assert.ok(to - from + 1n <= EVM_GETLOGS_MAX_RANGE)
  }
  // Cursor advanced to the end of the last COMPLETED range, so the next tick
  // resumes exactly there.
  const lastTo = calls.ranges[calls.ranges.length - 1][1]
  // Post-#35 this first-run scan is HISTORY's: live jumped to safeHead on
  // adoption so the present is covered from tick one, and the history cursor
  // is what advanced to the end of the last completed range.
  assert.equal(BigInt(cursors.backfill[cursors.backfill.length - 1]), lastTo)
  assert.equal(cursors.live[0], Number(safeHead), 'live adopted head immediately')
  // ONE write, before any history scan. Two writes here is the defect, not a
  // detail: a process that died between them left live at head with history
  // still uninitialised, and the next boot adopted live and called the
  // unscanned span covered.
  assert.deepEqual(cursors.writes[0], ['init', Number(safeHead)], 'adoption is a single atomic write')
  assert.equal(cursors.writes.filter(([kind]) => kind === 'init').length, 1, 'adoption runs once')
})

test('first run with a deploy block starts EXACTLY there, ignoring the recency window', async () => {
  const head = 500_000n
  // Deploy block far older than the 200k window — the window must not clip it.
  const deploy = 100_000
  const { deps, calls } = makeDeps({ cursor: 0, head, deploy_block: deploy, perRange: [[], [], [], [], []] })

  await evmPollTick(deps)

  assert.equal(calls.ranges[0][0], BigInt(deploy))
})

test('a deploy block still inside the unconfirmed zone is a no-op, not a crash', async () => {
  // Contract deployed 2 blocks ago on a 5-confirmation chain: nothing safe to
  // scan yet; the tick must wait rather than scan past safeHead.
  const { deps, calls, cursors } = makeDeps({ cursor: 0, head: 102n, deploy_block: 100, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  assert.deepEqual(calls.ranges, [], 'nothing safe to scan yet')
  assert.equal(result.enqueued, 0)
  // Adoption still runs — it is initialisation, not a scan — and leaves the
  // history cursor AT the block before the deploy, so nothing predating the
  // contract is ever queried.
  assert.deepEqual(cursors.backfill, [99])
  assert.equal(result.backfill_remaining, 0, 'no history exists before the deploy block')
})

test('the deploy block is ignored once a cursor exists (restart resumes at cursor+1)', async () => {
  const { deps, calls } = makeDeps({ cursor: 300_000, head: 400_005n, deploy_block: 100_000 })

  await evmPollTick(deps)

  assert.equal(calls.ranges[0][0], 300_001n)
})

test('a fresh low-block chain backfills from block 1', async () => {
  const { deps, calls } = makeDeps({ cursor: 0, head: 105n, logs: [ref('dd', 50n)] })

  await evmPollTick(deps)

  assert.equal(calls.ranges[0][0], 1n)
  assert.equal(calls.ranges[calls.ranges.length - 1][1], 100n)
  assert.equal(calls.enqueued.length, 1)
})

test('the next tick resumes a partial backfill from the stored cursor', async () => {
  const head = 500_000n
  const first = makeDeps({ cursor: 0, head, perRange: [[], [], [], [], []] })
  const r1 = await evmPollTick(first.deps)

  // Both positions carry over, which is the point: the second tick must resume
  // HISTORY where the first left it, not restart the window.
  const second = makeDeps({
    cursor: r1.cursor,
    backfill: r1.backfill_cursor,
    head,
    perRange: [[], [], [], [], []],
  })
  await evmPollTick(second.deps)

  assert.equal(second.calls.ranges[0][0], BigInt(r1.backfill_cursor) + 1n)
})

test('enqueue failure: cursor stops before the failed block, tick aborts', async () => {
  const ok = ref('aa', 150n)
  const bad = ref('bb', 160n)
  const after = ref('cc', 170n)
  const { deps, calls } = makeDeps({
    cursor: 100,
    head: 205n,
    logs: [ok, bad, after],
    enqueueFailsAt: bad.tx_hash,
  })

  const result = await evmPollTick(deps)

  assert.deepEqual(calls.enqueued, [ok.tx_hash])
  // Advanced only to the block before the failure; 'after' is never reached.
  assert.equal(calls.cursors[calls.cursors.length - 1], 159)
  assert.equal(result.cursor, 159)
  assert.equal(result.enqueued, 1)
})

test('enqueue failure in the FIRST block never moves the cursor backwards', async () => {
  const bad = ref('bb', 101n)
  const { deps, calls } = makeDeps({ cursor: 100, head: 205n, logs: [bad], enqueueFailsAt: bad.tx_hash })

  const result = await evmPollTick(deps)

  assert.deepEqual(calls.cursors, []) // 100 → no write, next tick retries 101
  assert.equal(result.cursor, 100)
})

test('an RPC failure leaves the cursor untouched and surfaces to the runner', async () => {
  const { deps, calls } = makeDeps({ cursor: 100, head: 205n })
  deps.rpc = {
    async getBlockNumber() {
      return 205n
    },
    async getLogRefs() {
      throw new Error('rpc down')
    },
  }

  await assert.rejects(() => evmPollTick(deps), /rpc down/)
  assert.deepEqual(calls.cursors, [])
})

test('verify-tx jobs carry the polling source and the Any-event dedup id', async () => {
  const log = ref('ee', 150n)
  const { deps } = makeDeps({ cursor: 100, head: 205n, logs: [log] })
  const jobs: Array<{ payload: unknown; job_id: string | undefined }> = []
  deps.queue = {
    async enqueue(_name, payload, options) {
      jobs.push({ payload, job_id: options?.job_id })
      return { job_id: 'x' }
    },
  }

  await evmPollTick(deps)

  assert.deepEqual(jobs[0].payload, { chain_id: CHAIN_ID, tx_ref: log.tx_hash, source: 'polling' })
  assert.equal(jobs[0].job_id, `verify-tx.eip155.84532.${log.tx_hash}.Any`)
})

test('listener start/stop: ticks on the interval, never overlaps, stops cleanly', async () => {
  let ticks = 0
  // Object property (not a let) so TS's closure flow analysis accepts the
  // assignment made inside the first tick.
  const gate: { release?: () => void } = {}
  const { deps } = makeDeps({ cursor: 100, head: 205n })
  deps.rpc = {
    async getBlockNumber() {
      ticks += 1
      // First tick blocks until released; no further tick may begin until it
      // settles, because the next one is only SCHEDULED after it resolves.
      if (ticks === 1) await new Promise<void>((resolve) => (gate.release = resolve))
      return 205n
    },
    async getLogRefs() {
      return []
    },
  }

  const listener = createEvmPollingListener({ ...deps, interval_ms: 5 })
  await listener.start()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(ticks, 1) // non-overlap is structural: nothing is scheduled yet
  gate.release?.()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.ok(ticks >= 2) // resumed ticking once free
  await listener.stop()
  const at = ticks
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(ticks, at) // no ticks after stop
})

// ---------- multi-contract watch set (open_issues #89) -----------------------

const PREVIOUS_CONTRACT = '0x9d0193f7000000000000000000000000000000aa' as const

test('watches every known contract in ONE getLogs call, not one call per address', async () => {
  // After a redeploy the previous contract still holds live escrows, so its
  // events must keep arriving — but watching it must not multiply RPC cost.
  // viem takes an address ARRAY, so the whole set rides a single request over a
  // single range; the provider's block cap bounds the RANGE, not the address
  // count. A regression to per-address calls would show up here as 2 calls.
  const logA = ref('aa', 150n)
  const { deps, calls } = makeDeps({
    cursor: 195,
    head: 205n,
    logs: [logA],
    escrow_contracts: [CONTRACT, PREVIOUS_CONTRACT],
  })

  await evmPollTick(deps)

  assert.equal(calls.ranges.length, 1, 'one range')
  assert.equal(calls.watched.length, 1, 'one getLogs call for the whole watch set')
  assert.deepEqual(calls.watched[0], [CONTRACT, PREVIOUS_CONTRACT])
})

test('a previous contract dropped from the watch set stops being scanned', async () => {
  // The negative: forget to record the previous contract and its escrows lose
  // the listener backstop silently. Pinning the set proves the tick asks for
  // exactly what it was given, never a hardcoded current-only address.
  const { deps, calls } = makeDeps({ cursor: 195, head: 205n, escrow_contracts: [CONTRACT] })

  await evmPollTick(deps)

  assert.deepEqual(calls.watched[0], [CONTRACT])
})

test('listener: a THROWING tick is logged and the loop survives it', async () => {
  // The property the recursive-setTimeout rewrite must not lose. This listener
  // is the backstop under lost client pings, so retiring it on one RPC blip
  // would silently remove the safety net for the rest of the process's life —
  // and nothing would report that it had stopped.
  let ticks = 0
  const warnings: string[] = []
  const { deps } = makeDeps({ cursor: 100, head: 205n })
  deps.log = { info() {}, warn: (_obj, msg) => warnings.push(msg) }
  deps.rpc = {
    async getBlockNumber() {
      ticks += 1
      if (ticks <= 2) throw new Error('rpc down')
      return 205n
    },
    async getLogRefs() {
      return []
    },
  }

  const listener = createEvmPollingListener({ ...deps, interval_ms: 5 })
  await listener.start()
  await new Promise((resolve) => setTimeout(resolve, 80))
  await listener.stop()

  assert.ok(ticks >= 3, `the loop must keep ticking through failures (saw ${ticks})`)
  assert.ok(warnings.length >= 2, 'each failure is logged, never swallowed')
})

test('listener: stop() during an in-flight tick does not resurrect the loop', async () => {
  // With recursion the reschedule happens INSIDE the tick's completion, so a
  // tick that was already running when stop() landed could otherwise queue the
  // next one after shutdown — a timer outliving the listener that created it.
  let ticks = 0
  const gate: { release?: () => void } = {}
  const { deps } = makeDeps({ cursor: 100, head: 205n })
  deps.rpc = {
    async getBlockNumber() {
      ticks += 1
      if (ticks === 1) await new Promise<void>((resolve) => (gate.release = resolve))
      return 205n
    },
    async getLogRefs() {
      return []
    },
  }

  const listener = createEvmPollingListener({ ...deps, interval_ms: 5 })
  await listener.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(ticks, 1, 'tick 1 is in flight')

  await listener.stop() // stop WHILE tick 1 is still running
  gate.release?.() // now let it finish
  await new Promise((resolve) => setTimeout(resolve, 40))

  assert.equal(ticks, 1, 'the completing tick must not schedule another')
})

// ---------- two cursors (#35) -------------------------------------------------

/**
 * The defect these cover: one cursor starting at the deploy block walked
 * forward oldest-first, so on a fast chain the listener spent HOURS scanning
 * history while live escrows went unseen. Measured on Galileo at 287,832
 * blocks behind head, with a real EscrowAccepted sitting in a block the cursor
 * had not reached. Ordering is the fix — not budget, which is unchanged.
 */

test('#35 live is scanned FIRST, and history only gets what is left', async () => {
  // 40 blocks of live work (4 ranges) and a deep history gap: the live window
  // must be covered this tick regardless of how far behind history is.
  const { deps, calls, cursors } = makeDeps({ cursor: 1_000, backfill: 100, head: 1_045n, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  // Live first: the earliest ranges queried are the ones above the live cursor.
  assert.equal(calls.ranges[0][0], 1_001n, 'the first call of the tick is the LIVE window')
  assert.equal(result.cursor, 1_040, 'live reached safeHead')
  assert.deepEqual(cursors.writes[0], ['live', 1_040], 'live is persisted before history runs')
  // History then resumes from its own position, never from the live one.
  const historyRanges = calls.ranges.filter(([from]) => from <= 1_000n)
  assert.equal(historyRanges[0][0], 101n)
  assert.ok(result.backfill_remaining > 0, 'history is still behind')
  // The budget is SHARED, not doubled — this is the constraint the fix promised.
  assert.ok(calls.ranges.length <= EVM_MAX_RANGES_PER_TICK, `${calls.ranges.length} ranges exceeds the tick budget`)
})

test('#35 history never scans above where live began — no block is paid for twice', async () => {
  const { deps, calls } = makeDeps({ cursor: 1_000, backfill: 900, head: 1_045n, min_confirmations: 5 })

  await evmPollTick(deps)

  const historyRanges = calls.ranges.filter(([from]) => from <= 1_000n)
  for (const [, to] of historyRanges) {
    assert.ok(to <= 1_000n, `history scanned ${to}, above the live start of 1000`)
  }
})

test('#35 a live window that eats the whole budget starves history rather than skipping blocks', async () => {
  // Head 3,000 blocks past the cursor: live alone needs 300 ranges, far past
  // the 20-range budget. The tick must spend everything on live and leave
  // history exactly where it was — dropping behind is recoverable, a gap is not.
  const { deps, calls, cursors } = makeDeps({ cursor: 1_000, backfill: 100, head: 4_005n, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  assert.equal(calls.ranges.length, EVM_MAX_RANGES_PER_TICK)
  for (const [from] of calls.ranges) assert.ok(from > 1_000n, 'every range this tick was live work')
  assert.deepEqual(cursors.backfill, [], 'history did not move')
  assert.ok(result.cursor < 4_000, 'live is still behind — the next tick continues')
})

test('#35 when history catches up it stays pinned to live, instead of the gap reopening each tick', async () => {
  // History one range short of the live start; after this tick the two meet.
  const { deps } = makeDeps({ cursor: 1_000, backfill: 995, head: 1_010n, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  assert.equal(result.backfill_remaining, 0, 'history complete')
  assert.equal(result.backfill_cursor, result.cursor, 'history tracks live once merged')
})

test('#35 an upgrade mid-walk adopts the old single cursor as HISTORY, not as live', async () => {
  // The pre-#35 deployment: one cursor part-way through a deploy-block walk,
  // no history cursor yet. Treating that value as "live" would have claimed the
  // 287k unscanned blocks were already covered — silent data loss. It is the
  // history position, and live jumps to head.
  const { deps, cursors } = makeDeps({ cursor: 100_000, backfill: null, head: 500_005n, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  assert.equal(cursors.backfill[0], 100_000, 'the old cursor became the HISTORY position')
  assert.equal(cursors.live[0], 500_000, 'live jumped to safeHead')
  assert.ok(result.backfill_remaining > 399_000, 'the unscanned span is now visible, not lost')
})

test('#35 a deployment that was already caught up adopts cleanly and rescans nothing', async () => {
  const { deps, calls, cursors } = makeDeps({ cursor: 500_000, backfill: null, head: 500_005n, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  assert.equal(result.backfill_remaining, 0)
  assert.deepEqual(calls.ranges, [], 'no rescan of already-scanned history')
  assert.equal(cursors.backfill[0], 500_000)
})

test('#35 adoption survives a crash: nothing is persisted unless BOTH positions are', async () => {
  // The pre-#35 upgrade path, interrupted. Adoption moves live to head AND
  // records where history must resume; if only the first half reaches the DB,
  // the row that comes back reads as "never initialised" with live already at
  // head — and the next boot adopts live, declaring the unscanned span covered.
  // MEASURED before the fix: 400,000 blocks reported as backfill_remaining 0.
  const { deps, cursors } = makeDeps({ cursor: 100_000, backfill: null, head: 500_005n })
  const dying = {
    ...cursors,
    async initCursors(): Promise<void> {
      throw new Error('process died mid-adoption')
    },
  }

  await assert.rejects(() => evmPollTick({ ...deps, cursors: dying }), /died mid-adoption/)

  assert.deepEqual(cursors.writes, [], 'a failed adoption leaves NO half-written state')

  // Reboot on that surviving state: history must still be uninitialised, so
  // adoption runs again and lands on the OLD cursor, not on head.
  const rebooted = makeDeps({ cursor: 100_000, backfill: null, head: 500_005n })
  const result = await evmPollTick(rebooted.deps)
  assert.equal(rebooted.cursors.backfill[0], 100_000, 'history resumes at the old cursor')
  assert.ok(result.backfill_remaining > 399_000, 'the unscanned span is still visible')
})

test('#35 a stalled history on a block-1 chain is never mistaken for an uninitialised one', async () => {
  // `historyStart - 1` is 0 on a chain whose history starts at block 1, so a 0
  // sentinel would make this row read as "never initialised" the moment the
  // first history range failed to advance — and the next tick would adopt live
  // and skip blocks 1..100 forever. NULL is what "never initialised" means.
  const bad = ref('bb', 1n)
  const { deps, cursors } = makeDeps({
    cursor: 0,
    head: 105n,
    logs: [bad],
    enqueueFailsAt: bad.tx_hash,
  })

  const stalled = await evmPollTick(deps)
  assert.equal(stalled.backfill_cursor, 0, 'history could not advance past the failed block')

  // Queue recovers; the same store, one tick later.
  const next = await evmPollTick({
    ...deps,
    rpc: { ...deps.rpc, async getBlockNumber() { return 115n } },
    queue: { async enqueue() { return { job_id: 'x' } } },
  })
  assert.equal(cursors.writes.filter(([kind]) => kind === 'init').length, 1, 'adoption did not run twice')
  assert.ok(next.backfill_cursor >= 100, `history resumed from block 1, reaching ${next.backfill_cursor}`)
})

test('#35 an aborted live scan leaves a complete history pinned', async () => {
  // History was complete (backfill === live). Live then advances and aborts on
  // a dead queue. Returning there without re-pinning would leave history behind
  // live, and the next tick would re-scan blocks live had already covered — the
  // exact waste the completion pin exists to prevent.
  const bad = ref('cc', 1_010n)
  const { deps } = makeDeps({
    cursor: 1_000,
    backfill: 1_000,
    head: 1_105n,
    logs: [bad],
    enqueueFailsAt: bad.tx_hash,
  })

  const result = await evmPollTick(deps)

  assert.equal(result.cursor, 1_009, 'live advanced to the block before the failure')
  assert.equal(result.backfill_cursor, result.cursor, 'history stayed pinned to live')
  assert.equal(result.backfill_remaining, 0)
})

// ---------- what the tick REPORTS (#35's observability half) ------------------

/**
 * The measured failure was silent: a cursor 287,832 blocks behind head looked
 * exactly like a healthy one from outside the process. These pin the level and
 * the fields, because a log line nobody can distinguish from "fine" is the
 * defect, not the fix.
 */
type LogRecord = { level: 'info' | 'warn'; msg: string; fields: Record<string, unknown> }

/** Run the listener for one tick and return only the lines the TICK emitted. */
async function tickLog(deps: EvmPollTickDeps): Promise<LogRecord[]> {
  const records: LogRecord[] = []
  const listener = createEvmPollingListener({
    ...deps,
    interval_ms: 1,
    log: {
      info: (fields, msg) => records.push({ level: 'info', msg, fields }),
      warn: (fields, msg) => records.push({ level: 'warn', msg, fields }),
    },
  })
  await listener.start()
  await new Promise((resolve) => setTimeout(resolve, 30))
  await listener.stop()
  // 'polling listener started' is the SKELETON's line, not the tick's.
  return records.filter((r) => r.msg.startsWith('evm polling'))
}

test('#35 a live cursor far behind head is reported as a WARNING', async () => {
  // 500k blocks of live work at 200 a tick: live cannot catch up this tick, and
  // that is the condition the app is serving stale escrow state under.
  const { deps } = makeDeps({ cursor: 100, backfill: 100, head: 500_005n })

  const [first] = await tickLog(deps)

  assert.equal(first.level, 'warn', 'a cursor this far behind head must not be an info line')
  assert.match(first.msg, /falling behind head/)
  assert.ok(
    Number(first.fields.live_lag) > EVM_LIVE_LAG_WARN_BLOCKS,
    'the lag itself is on the line, so the gap can be charted rather than inferred',
  )
  assert.equal(first.fields.head, 500_005)
  assert.equal(first.fields.chain_id, CHAIN_ID)
})

test('#35 a healthy live cursor with history still open reports converging, at info', async () => {
  // Live reaches safeHead this tick (lag = the 5 confirmations), history does not.
  const { deps } = makeDeps({ cursor: 1_000, backfill: 100, head: 1_045n })

  const [first] = await tickLog(deps)

  assert.equal(first.level, 'info', 'live is current — this is not a warning')
  assert.match(first.msg, /history still converging/)
  assert.ok(Number(first.fields.backfill_remaining) > 0, 'the outstanding history is on the line')
})

test('#35 both cursors caught up reports the plain tick', async () => {
  const { deps } = makeDeps({ cursor: 200, backfill: 200, head: 205n })

  const [first] = await tickLog(deps)

  assert.equal(first.level, 'info')
  assert.equal(first.msg, 'evm polling tick')
  assert.equal(first.fields.backfill_remaining, 0)
})

test('#35 history that found work is still reported as converging, not silenced', async () => {
  // The condition an earlier gate suppressed: history enqueued something AND is
  // still behind. That is the most informative tick there is.
  const { deps } = makeDeps({ cursor: 1_000, backfill: 100, head: 1_045n, logs: [ref('aa', 150n)] })

  const [first] = await tickLog(deps)

  assert.ok(Number(first.fields.enqueued) > 0, 'this tick enqueued work')
  assert.match(first.msg, /history still converging/)
})

test('#35 with no interval given, the listener runs at the production cadence', async (t) => {
  // Production never passes `interval_ms` — plugins/listeners.ts hands over
  // `evmListenerDeps` and nothing else — so the `?? EVM_POLL_INTERVAL_MS`
  // default IS the shipped poll rate, and every other test in this file
  // overrides it. Mocked timers assert the exact delay rather than a bound.
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => t.mock.timers.reset())

  let ticks = 0
  const { deps } = makeDeps({ cursor: 200, backfill: 200, head: 205n })
  deps.rpc = {
    async getBlockNumber() {
      ticks += 1
      return 205n
    },
    async getLogRefs() {
      return []
    },
  }

  const listener = createEvmPollingListener(deps) // no interval_ms
  await listener.start()

  t.mock.timers.tick(EVM_POLL_INTERVAL_MS - 1)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(ticks, 0, 'nothing fires before the production interval elapses')

  t.mock.timers.tick(1)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(ticks, 1, 'the first tick lands exactly at EVM_POLL_INTERVAL_MS')

  await listener.stop()
})

test('#35 a chain with fewer blocks than it confirms never stores a negative cursor', async () => {
  // safeHead is head MINUS the confirmation depth, so a node still at genesis
  // makes it negative — and the live cursor is PERSISTED. A negative block
  // ordinal does not reach the chain as a bad query; viem refuses to encode it
  // (IntegerOutOfRangeError), so the tick throws before the RPC call and the
  // listener retries the same poisoned cursor forever, with adoption unable to
  // re-run because the history cursor is no longer null. The manifest has
  // chains at 2 and 3 confirmations.
  const { deps, calls, cursors } = makeDeps({ cursor: 0, head: 0n, min_confirmations: 3 })

  const first = await evmPollTick(deps)

  assert.equal(first.cursor, 0, 'nothing safe to scan yet, but the cursor stays a real block')
  assert.ok(
    cursors.live.every((n) => n >= 0),
    `a negative ordinal was persisted: ${JSON.stringify(cursors.live)}`,
  )

  // The chain then produces blocks; the next tick must query real ones.
  deps.rpc = { ...deps.rpc, async getBlockNumber() { return 100n } }
  await evmPollTick(deps)

  const negative = calls.ranges.filter(([from]) => from < 0n)
  assert.deepEqual(negative, [], `eth_getLogs asked for a negative block: ${negative.map(String)}`)
  assert.equal(calls.ranges[0][0], 1n, 'the scan starts at block 1, the same floor history uses')
})

test('#35 a cursor already poisoned by a negative value heals instead of staying wedged', async () => {
  // A deployment that ran the pre-fix code has a negative last_block AND a
  // non-null history cursor, so adoption will never run again to correct it.
  // Flooring on READ is what unwedges it.
  const { deps, calls } = makeDeps({ cursor: -3, backfill: 0, head: 100n, min_confirmations: 3 })

  await evmPollTick(deps)

  assert.deepEqual(calls.ranges.filter(([from]) => from < 0n), [], 'no negative query')
  assert.equal(calls.ranges[0][0], 1n)
})
