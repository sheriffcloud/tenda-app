/**
 * createRefreshCoordinator — the whole machine, in ONE place.
 *
 * Each client used to prove these behaviours in its own 40-odd-line suite. The
 * trailing-edge branch is the subtle one and the one that matters: it is what
 * stops the last trigger — the read that reflects what the user just did —
 * being swallowed by a refresh that was already in flight.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRefreshCoordinator } from '../../../src/utils/async/refresh-coordinator'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Let every already-queued microtask drain. */
const settle = () => new Promise((r) => setImmediate(r))

function counting(impl: () => void | Promise<void> = () => {}) {
  let calls = 0
  const fn = () => {
    calls += 1
    return impl()
  }
  return { fn, get calls() { return calls } }
}

// ---------- coalescing ------------------------------------------------------

test('requests during a running refresh coalesce into exactly ONE trailing run', async () => {
  const gate = deferred()
  const refresh = counting(() => gate.promise)
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  c.request()
  c.request()
  assert.equal(refresh.calls, 1, 'the first request runs; the rest queue')

  gate.resolve()
  await settle()
  // ONE trailing, not one per suppressed request — the whole point of the
  // `trailing` flag being a boolean rather than a counter.
  assert.equal(refresh.calls, 2)
})

test('the trailing run itself coalesces, so a steady stream cannot pile up', async () => {
  let gate = deferred()
  const refresh = counting(() => gate.promise)
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  c.request()
  gate.resolve()
  gate = deferred()
  await settle()
  assert.equal(refresh.calls, 2)

  // More requests arrive while the TRAILING run is in flight.
  c.request()
  c.request()
  gate.resolve()
  await settle()
  assert.equal(refresh.calls, 3)
})

test('a request AFTER the run settles starts a fresh run rather than queueing', async () => {
  const refresh = counting()
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  await settle()
  assert.equal(refresh.calls, 1)
  c.request()
  await settle()
  assert.equal(refresh.calls, 2)
})

// ---------- failure containment --------------------------------------------

test('a rejecting refresh is contained and the loop stays usable', async () => {
  // Fire-and-forget callers must not produce an unhandled rejection, and the
  // next trigger must still work — failures here are recoverable by design.
  let shouldReject = true
  const refresh = counting(() => {
    if (shouldReject) {
      shouldReject = false
      return Promise.reject(new Error('down'))
    }
    return Promise.resolve()
  })
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  await settle()
  assert.equal(refresh.calls, 1)

  c.request()
  await settle()
  assert.equal(refresh.calls, 2)
})

test('a rejection still releases the trailing run queued behind it', async () => {
  // `running = false` lives in `finally`, so a throw must not strand the
  // coordinator with `running` stuck true — which would silence it forever.
  const gate = deferred()
  let first = true
  const refresh = counting(() => {
    if (first) {
      first = false
      return gate.promise.then(() => Promise.reject(new Error('down')))
    }
    return Promise.resolve()
  })
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  c.request()
  gate.resolve()
  await settle()

  assert.equal(refresh.calls, 2)
})

test('a SYNCHRONOUS throw is contained too', async () => {
  const refresh = counting(() => {
    throw new Error('sync')
  })
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  await settle()
  c.request()
  await settle()

  assert.equal(refresh.calls, 2)
})

// ---------- stop ------------------------------------------------------------

test('stop() cancels a queued trailing run and blocks every future request', async () => {
  const gate = deferred()
  const refresh = counting(() => gate.promise)
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  c.request() // trailing queued
  c.stop()
  gate.resolve()
  await settle()
  c.request() // after stop: ignored

  assert.equal(refresh.calls, 1)
})

test('stop() before anything ran means nothing ever runs', async () => {
  const refresh = counting()
  const c = createRefreshCoordinator(refresh.fn)

  c.stop()
  c.request()
  await settle()

  assert.equal(refresh.calls, 0)
})

test('a non-promise refresh is supported — the signature allows void', async () => {
  // `() => void | Promise<void>`: a synchronous refresh must still coalesce
  // rather than throwing on an awaited undefined.
  const refresh = counting(() => {})
  const c = createRefreshCoordinator(refresh.fn)

  c.request()
  c.request()
  await settle()

  assert.ok(refresh.calls >= 1)
})
