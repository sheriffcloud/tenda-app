/** Bounded async retry (ported from mobile when the module moved here). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry } from '../../src/utils/with-retry'

const noSleep = async (): Promise<void> => {}

function counting<T>(impl: (call: number) => Promise<T>) {
  let calls = 0
  const fn = async () => impl(++calls)
  return { fn, calls: () => calls }
}

test('returns the first success without retrying', async () => {
  const { fn, calls } = counting(async () => 'ok')
  assert.equal(await withRetry(fn, { sleep: noSleep }), 'ok')
  assert.equal(calls(), 1)
})

test('retries a transient failure and succeeds within the attempt budget', async () => {
  const { fn, calls } = counting(async (call) => {
    if (call < 3) throw new Error('transient')
    return 'ok'
  })
  assert.equal(await withRetry(fn, { attempts: 3, sleep: noSleep }), 'ok')
  assert.equal(calls(), 3)
})

test('gives up after exhausting attempts and rethrows the last error', async () => {
  const err = new Error('always')
  const { fn, calls } = counting(async () => {
    throw err
  })
  await assert.rejects(withRetry(fn, { attempts: 3, sleep: noSleep }), err)
  assert.equal(calls(), 3)
})

test('does not retry when shouldRetry returns false (terminal error)', async () => {
  const err = new Error('terminal')
  const { fn, calls } = counting(async () => {
    throw err
  })
  await assert.rejects(withRetry(fn, { attempts: 5, shouldRetry: () => false, sleep: noSleep }), err)
  assert.equal(calls(), 1)
})

test('uses the real setTimeout backoff when no sleep seam is injected', async () => {
  const { fn, calls } = counting(async (call) => {
    if (call < 2) throw new Error('transient')
    return 'ok'
  })
  assert.equal(await withRetry(fn, { attempts: 2, baseMs: 1 }), 'ok')
  assert.equal(calls(), 2)
})

test('backs off base·2^i between attempts and never sleeps after the last', async () => {
  const delays: number[] = []
  const { fn } = counting(async () => {
    throw new Error('x')
  })
  await withRetry(fn, {
    attempts: 3,
    baseMs: 100,
    sleep: async (ms) => void delays.push(ms),
  }).catch(() => {})
  assert.deepEqual(delays, [100, 200])
})
