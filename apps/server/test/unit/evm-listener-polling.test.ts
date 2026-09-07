/**
 * chains/evm/listener-polling — block-cursor tick: bounded backfill on first
 * run, chunked ranges with the per-tick cap, per-tx-hash dedup inside a range,
 * confirmation lag, cursor advance per completed range, and the
 * abort-without-advance contract when the queue dies mid-batch.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  evmPollTick,
  createEvmPollingListener,
  EVM_BACKFILL_BLOCKS,
  EVM_GETLOGS_MAX_RANGE,
  EVM_MAX_RANGES_PER_TICK,
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
  calls: {
    enqueued: string[]
    cursors: number[]
    ranges: Array<[bigint, bigint]>
    watched: Array<readonly string[]>
  }
} {
  const calls = {
    enqueued: [] as string[],
    cursors: [] as number[],
    ranges: [] as Array<[bigint, bigint]>,
    /** Address set passed to each getLogRefs call, to prove it is ONE call. */
    watched: [] as Array<readonly string[]>,
  }
  let cursor = opts.cursor ?? 0
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
    cursors: {
      async getCursor() {
        return cursor
      },
      async setCursor(_chain, ordinal) {
        cursor = ordinal
        calls.cursors.push(ordinal)
      },
    },
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
  return { deps, calls }
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
  assert.deepEqual(result, { ranges: 0, logs: 0, enqueued: 0, cursor: 200 })
})

test('head within the confirmation lag of the cursor is a no-op (never scans unconfirmed blocks)', async () => {
  const { deps, calls } = makeDeps({ cursor: 200, head: 204n, min_confirmations: 5 })

  await evmPollTick(deps)

  assert.deepEqual(calls.ranges, [])
  assert.deepEqual(calls.cursors, [])
})

test('first run backfills a bounded window, never from genesis', async () => {
  const head = 500_000n
  const { deps, calls } = makeDeps({ cursor: 0, head, perRange: [[], [], [], [], []] })

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
  assert.equal(BigInt(calls.cursors[calls.cursors.length - 1]), lastTo)
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
  const { deps, calls } = makeDeps({ cursor: 0, head: 102n, deploy_block: 100, min_confirmations: 5 })

  const result = await evmPollTick(deps)

  assert.deepEqual(calls.ranges, [])
  assert.deepEqual(calls.cursors, [])
  assert.equal(result.enqueued, 0)
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

  const second = makeDeps({ cursor: r1.cursor, head, perRange: [[], [], [], [], []] })
  await evmPollTick(second.deps)

  assert.equal(second.calls.ranges[0][0], BigInt(r1.cursor) + 1n)
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
