/**
 * Guarded wallet requests: the timeout/abort race that keeps a lost relay
 * response from hanging a flow forever, plus the subscribable in-flight
 * registry the Cancel button rides. `disconnect` is a required injected seam
 * (the whole reason the module could move to shared) — no wallet stack is
 * touched anywhere in these tests.
 */
import { test, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'
import {
  guardWalletRequest,
  abortPendingWalletRequest,
  hasPendingWalletRequest,
  subscribePendingWalletRequest,
  WC_REQUEST_TIMEOUT_MS,
  WC_CANCELLED_MESSAGE,
  WC_TIMEOUT_MESSAGE,
} from '../../src/wallet/request-guard'
import { WalletError } from '../../src/wallet/errors'

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] })
})

afterEach(() => {
  // Any test that left a request pending must not leak into the next.
  abortPendingWalletRequest()
  mock.timers.reset()
})

/** A promise the test settles by hand, standing in for provider.request(). */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Records calls; resolves immediately. */
function makeDisconnect(): { disconnect: () => Promise<void>; calls: () => number } {
  let count = 0
  return {
    disconnect: async () => {
      count += 1
    },
    calls: () => count,
  }
}

async function rejectionOf(p: Promise<unknown>): Promise<WalletError> {
  try {
    await p
  } catch (e) {
    assert.ok(e instanceof WalletError)
    return e
  }
  assert.fail('expected the guarded promise to reject')
}

test('passes the wallet result through and clears the registry', async () => {
  const { disconnect, calls } = makeDisconnect()
  const wallet = deferred<string>()
  const guarded = guardWalletRequest(wallet.promise, { disconnect })

  assert.strictEqual(hasPendingWalletRequest(), true)
  wallet.resolve('0xhash')
  assert.strictEqual(await guarded, '0xhash')
  assert.strictEqual(hasPendingWalletRequest(), false)
  assert.strictEqual(calls(), 0)
})

test('propagates a wallet rejection (user declined in the wallet) untouched', async () => {
  const { disconnect, calls } = makeDisconnect()
  const wallet = deferred<string>()
  const guarded = guardWalletRequest(wallet.promise, { disconnect })

  wallet.reject(new Error('User rejected the request'))
  await assert.rejects(guarded, /User rejected the request/)
  assert.strictEqual(hasPendingWalletRequest(), false)
  assert.strictEqual(calls(), 0)
})

test('times out with a typed WalletError and drops the session', async () => {
  const { disconnect, calls } = makeDisconnect()
  const wallet = deferred<string>()
  const guarded = guardWalletRequest(wallet.promise, { disconnect })

  mock.timers.tick(WC_REQUEST_TIMEOUT_MS)
  const err = await rejectionOf(guarded)
  assert.strictEqual(err.code, 'timeout')
  assert.strictEqual(err.message, WC_TIMEOUT_MESSAGE)
  assert.strictEqual(calls(), 1)
  assert.strictEqual(hasPendingWalletRequest(), false)

  // A late wallet answer after the timeout must not blow up (unhandled
  // rejection) nor resurrect the settled guard.
  wallet.resolve('0xlate')
  await Promise.resolve()
})

test('honours a custom timeoutMs', async () => {
  const { disconnect } = makeDisconnect()
  const guarded = guardWalletRequest(deferred<string>().promise, { disconnect, timeoutMs: 1_000 })

  mock.timers.tick(999)
  assert.strictEqual(hasPendingWalletRequest(), true)
  mock.timers.tick(1)
  const err = await rejectionOf(guarded)
  assert.strictEqual(err.code, 'timeout')
})

test('abortPendingWalletRequest rejects as a decline and drops the session', async () => {
  const { disconnect, calls } = makeDisconnect()
  const guarded = guardWalletRequest(deferred<string>().promise, { disconnect })

  abortPendingWalletRequest()
  const err = await rejectionOf(guarded)
  assert.strictEqual(err.code, 'declined')
  assert.strictEqual(err.message, WC_CANCELLED_MESSAGE)
  assert.strictEqual(calls(), 1)
  assert.strictEqual(hasPendingWalletRequest(), false)
})

test('abort with nothing in flight is a no-op', () => {
  assert.strictEqual(hasPendingWalletRequest(), false)
  assert.doesNotThrow(() => abortPendingWalletRequest())
})

test('a hanging or throwing disconnect never blocks the rejection', async () => {
  // Disconnect that neither resolves nor rejects within the test.
  const guardedHang = guardWalletRequest(deferred<string>().promise, {
    disconnect: () => new Promise<void>(() => {}),
    timeoutMs: 500,
  })
  mock.timers.tick(500)
  assert.strictEqual((await rejectionOf(guardedHang)).code, 'timeout')

  const guardedThrow = guardWalletRequest(deferred<string>().promise, {
    disconnect: async () => {
      throw new Error('relay dead')
    },
  })
  abortPendingWalletRequest()
  assert.strictEqual((await rejectionOf(guardedThrow)).code, 'declined')
})

test('notifies subscribers when a request starts and when it settles', async () => {
  const events: boolean[] = []
  const unsubscribe = subscribePendingWalletRequest(() => events.push(hasPendingWalletRequest()))
  const { disconnect } = makeDisconnect()

  const wallet = deferred<string>()
  const guarded = guardWalletRequest(wallet.promise, { disconnect })
  assert.deepStrictEqual(events, [true])

  wallet.resolve('0xhash')
  await guarded
  assert.deepStrictEqual(events, [true, false])

  unsubscribe()
  const second = guardWalletRequest(deferred<string>().promise, { disconnect })
  assert.deepStrictEqual(events, [true, false]) // unsubscribed, no further pushes
  abortPendingWalletRequest()
  assert.strictEqual((await rejectionOf(second)).code, 'declined')
})
