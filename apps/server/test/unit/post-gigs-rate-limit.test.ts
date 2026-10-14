/**
 * scripts/post-gigs/rate-limit — the seeder's back-off against
 * `/v1/agent/tasks`, which admits ten requests a minute while each gig spends
 * two of them. The waiting is injected, so every branch runs offline and
 * instantly.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  retryAfterMs,
  withRateLimitRetry,
  RATE_LIMITED,
  RATE_LIMIT_WINDOW_MS,
  RETRY_GRACE_MS,
  type RateLimitedResponse,
} from '@server/scripts/post-gigs/rate-limit'

function res(
  status: number,
  json: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): RateLimitedResponse {
  return { status, json, headers: new Headers(headers) }
}

const LIMITED = (json: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  res(RATE_LIMITED, json, headers)

/** Records what it was asked to wait instead of waiting. */
function recorder(): { waits: number[]; wait: (ms: number) => Promise<void> } {
  const waits: number[] = []
  return {
    waits,
    wait: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
  }
}

const silent = { onWait: () => {} }

test('retryAfterMs prefers the retry-after header', () => {
  assert.equal(retryAfterMs(LIMITED({}, { 'retry-after': '43' })), 43_000 + RETRY_GRACE_MS)
})

test('retryAfterMs adds grace, because retry-after is rounded-down whole seconds', () => {
  // Returning at exactly the stated second can land a tick early and burn a
  // request against the very bucket being waited on.
  assert.ok(retryAfterMs(LIMITED({}, { 'retry-after': '1' })) > 1_000)
})

test('retryAfterMs accepts a zero header rather than treating it as absent', () => {
  assert.equal(retryAfterMs(LIMITED({}, { 'retry-after': '0' })), RETRY_GRACE_MS)
})

test('retryAfterMs falls back to the message this API actually sends', () => {
  const message = 'Rate limit exceeded, retry in 39 seconds'
  assert.equal(retryAfterMs(LIMITED({ message })), 39_000 + RETRY_GRACE_MS)
})

test('retryAfterMs reads a one-second message despite the singular', () => {
  assert.equal(retryAfterMs(LIMITED({ message: 'retry in 1 second' })), 1_000 + RETRY_GRACE_MS)
})

test('retryAfterMs falls back to a full window when the server says nothing', () => {
  assert.equal(retryAfterMs(LIMITED()), RATE_LIMIT_WINDOW_MS)
})

test('retryAfterMs ignores a non-numeric header and a message with no figure', () => {
  assert.equal(retryAfterMs(LIMITED({ message: 'slow down' }, { 'retry-after': 'soon' })), RATE_LIMIT_WINDOW_MS)
  assert.equal(retryAfterMs(LIMITED({ message: 42 })), RATE_LIMIT_WINDOW_MS)
})

test('retryAfterMs ignores a negative header rather than waiting a negative time', () => {
  assert.equal(retryAfterMs(LIMITED({}, { 'retry-after': '-5' })), RATE_LIMIT_WINDOW_MS)
})

test('withRateLimitRetry does not call twice when the first attempt succeeds', async () => {
  let calls = 0
  const { waits, wait } = recorder()
  const out = await withRateLimitRetry(
    () => {
      calls += 1
      return Promise.resolve(res(201, { ok: true }))
    },
    { attempts: 5, wait, ...silent },
  )
  assert.equal(calls, 1)
  assert.equal(out.status, 201)
  assert.deepEqual(waits, [])
})

test('withRateLimitRetry waits the stated time and retries after a 429', async () => {
  const statuses = [RATE_LIMITED, 201]
  const { waits, wait } = recorder()
  const out = await withRateLimitRetry(
    () => Promise.resolve(res(statuses.shift() ?? 500, {}, { 'retry-after': '2' })),
    { attempts: 5, wait, ...silent },
  )
  assert.equal(out.status, 201)
  assert.deepEqual(waits, [2_000 + RETRY_GRACE_MS])
})

test('withRateLimitRetry gives up after `attempts` and returns the last 429', async () => {
  let calls = 0
  const { waits, wait } = recorder()
  const out = await withRateLimitRetry(
    () => {
      calls += 1
      return Promise.resolve(LIMITED({ message: 'Rate limit exceeded, retry in 3 seconds' }))
    },
    { attempts: 3, wait, ...silent },
  )
  // Three attempts means three calls and only TWO waits — it must not sleep
  // after the final one, which would delay the failure report for nothing.
  assert.equal(calls, 3)
  assert.equal(waits.length, 2)
  assert.equal(out.status, RATE_LIMITED)
})

test('withRateLimitRetry never retries a non-429 failure', async () => {
  // A 422 is the caller's problem: re-sending a rejected body just wastes the
  // limiter budget the rest of the book needs.
  let calls = 0
  const out = await withRateLimitRetry(
    () => {
      calls += 1
      return Promise.resolve(res(422, { message: 'bad amount' }))
    },
    { attempts: 5, wait: () => Promise.resolve(), ...silent },
  )
  assert.equal(calls, 1)
  assert.equal(out.status, 422)
})

test('withRateLimitRetry announces each wait to the operator', async () => {
  const seen: { waitMs: number; attempt: number }[] = []
  const statuses = [RATE_LIMITED, RATE_LIMITED, 201]
  await withRateLimitRetry(() => Promise.resolve(res(statuses.shift() ?? 500, {}, { 'retry-after': '1' })), {
    attempts: 5,
    wait: () => Promise.resolve(),
    onWait: (waitMs, attempt) => seen.push({ waitMs, attempt }),
  })
  assert.deepEqual(
    seen.map((s) => s.attempt),
    [1, 2],
  )
  assert.ok(seen.every((s) => s.waitMs === 1_000 + RETRY_GRACE_MS))
})

test('attempts of 1 disables retrying entirely', async () => {
  let calls = 0
  const { waits, wait } = recorder()
  await withRateLimitRetry(
    () => {
      calls += 1
      return Promise.resolve(LIMITED())
    },
    { attempts: 1, wait, ...silent },
  )
  assert.equal(calls, 1)
  assert.deepEqual(waits, [])
})
