/**
 * chains/solana/listener-polling — cursor-driven tick: fresh-slot
 * filtering, oldest-first enqueue, cursor advance, and the abort-without-
 * advance contract when the queue dies mid-batch.
 */

import { fakeCursorStore } from '../helpers/cursor-store'
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  pollTick,
  createSolanaPollingListener,
  type PollTickDeps,
} from '@server/chains/solana/listener-polling'
import { fakeSolanaRpc } from '../helpers/solana'

function makeDeps(opts: {
  cursor?: number
  signatures: Array<{ signature: string; slot: number }>
  enqueueFailsAt?: string
}): {
  deps: PollTickDeps
  calls: { enqueued: string[]; cursors: readonly number[] }
} {
  const rpc = fakeSolanaRpc()
  rpc.stageSignatures(opts.signatures)
  // The shared fake IS the cursor store — it already reads back what it wrote
  // and records every write in order. Re-implementing that half by hand was the
  // duplication `fakeCursorStore` exists to remove.
  const cursors = fakeCursorStore({ live: opts.cursor ?? 0 })
  const calls = { enqueued: [] as string[], cursors: cursors.live }
  const deps: PollTickDeps = {
    rpc,
    chain_id: 'solana:devnet',
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
  return { deps, calls }
}

test('enqueues only signatures beyond the cursor, oldest first, then advances', async () => {
  const { deps, calls } = makeDeps({
    cursor: 100,
    signatures: [
      { signature: 'new-2', slot: 120 }, // newest first, as the RPC returns
      { signature: 'new-1', slot: 110 },
      { signature: 'old', slot: 90 },
    ],
  })
  const r = await pollTick(deps)
  assert.deepStrictEqual(calls.enqueued, ['new-1', 'new-2'])
  assert.strictEqual(r.enqueued, 2)
  assert.deepStrictEqual(calls.cursors, [120])
})

test('no fresh signatures → no enqueue, cursor untouched', async () => {
  const { deps, calls } = makeDeps({
    cursor: 200,
    signatures: [{ signature: 'old', slot: 150 }],
  })
  const r = await pollTick(deps)
  assert.strictEqual(r.enqueued, 0)
  assert.strictEqual(calls.cursors.length, 0)
  assert.strictEqual(r.cursor, 200)
})

test('queue failure mid-batch aborts WITHOUT advancing past the gap', async () => {
  const { deps, calls } = makeDeps({
    cursor: 100,
    signatures: [
      { signature: 'c', slot: 130 },
      { signature: 'b', slot: 120 },
      { signature: 'a', slot: 110 },
    ],
    enqueueFailsAt: 'b',
  })
  const r = await pollTick(deps)
  // 'a' (slot 110) enqueued; 'b' (120) failed → cursor parks at 119 so the
  // next tick retries from 'b' onward.
  assert.deepStrictEqual(calls.enqueued, ['a'])
  assert.deepStrictEqual(calls.cursors, [119])
  assert.strictEqual(r.cursor, 119)
})

test('fresh start (cursor 0) sweeps the whole batch', async () => {
  const { deps, calls } = makeDeps({
    signatures: [
      { signature: 's2', slot: 2 },
      { signature: 's1', slot: 1 },
    ],
  })
  await pollTick(deps)
  assert.deepStrictEqual(calls.enqueued, ['s1', 's2'])
})

// ---------- listener lifecycle (the timer shim around pollTick) --------------

test('createSolanaPollingListener: start ticks pollTick on the interval; stop halts it', async (t) => {
  // The skeleton schedules with a recursive setTimeout, not setInterval.
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => t.mock.timers.reset())

  const { deps, calls } = makeDeps({ signatures: [{ signature: 's1', slot: 5 }] })
  const listener = createSolanaPollingListener({ ...deps, interval_ms: 1000 })

  await listener.start()
  assert.deepStrictEqual(calls.enqueued, []) // nothing before the first delay elapses

  t.mock.timers.tick(1000)
  // pollTick is fire-and-forget inside the timer; flush its async chain.
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
  assert.deepStrictEqual(calls.enqueued, ['s1'])

  await listener.stop()
  t.mock.timers.tick(5000) // no further ticks after stop
  await new Promise((r) => setImmediate(r))
  assert.strictEqual(calls.enqueued.length, 1)
})
