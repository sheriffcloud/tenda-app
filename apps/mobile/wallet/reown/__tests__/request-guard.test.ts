/**
 * Guarded WC requests: the timeout/abort race that keeps a lost relay
 * response from hanging a flow forever, plus the subscribable in-flight
 * registry the Cancel button rides. The connectionSignal default disconnect
 * is bypassed via the injectable seam, no reown stack is touched.
 */

// request-guard imports connectionSignal only for the default disconnect;
// stub the module so the test never loads the AppKit-adjacent stack.
jest.mock('@/wallet/reown/connection-signal', () => ({
  connectionSignal: { disconnect: jest.fn().mockResolvedValue(undefined) },
}))

import {
  guardWcRequest,
  abortPendingWalletRequest,
  hasPendingWalletRequest,
  subscribePendingWalletRequest,
  WC_REQUEST_TIMEOUT_MS,
  WC_CANCELLED_MESSAGE,
  WC_TIMEOUT_MESSAGE,
} from '@/wallet/reown/request-guard'
import { WalletError } from '@/wallet/errors'

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  // Any test that left a request pending must not leak into the next.
  abortPendingWalletRequest()
  jest.useRealTimers()
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

test('passes the wallet result through and clears the registry', async () => {
  const disconnect = jest.fn().mockResolvedValue(undefined)
  const wallet = deferred<string>()
  const guarded = guardWcRequest(wallet.promise, { disconnect })

  expect(hasPendingWalletRequest()).toBe(true)
  wallet.resolve('0xhash')
  await expect(guarded).resolves.toBe('0xhash')
  expect(hasPendingWalletRequest()).toBe(false)
  expect(disconnect).not.toHaveBeenCalled()
})

test('propagates a wallet rejection (user declined in the wallet) untouched', async () => {
  const disconnect = jest.fn().mockResolvedValue(undefined)
  const wallet = deferred<string>()
  const guarded = guardWcRequest(wallet.promise, { disconnect })

  wallet.reject(new Error('User rejected the request'))
  await expect(guarded).rejects.toThrow('User rejected the request')
  expect(hasPendingWalletRequest()).toBe(false)
  expect(disconnect).not.toHaveBeenCalled()
})

test('times out with a typed WalletError and drops the session', async () => {
  const disconnect = jest.fn().mockResolvedValue(undefined)
  const wallet = deferred<string>()
  const guarded = guardWcRequest(wallet.promise, { disconnect })

  jest.advanceTimersByTime(WC_REQUEST_TIMEOUT_MS)
  await expect(guarded).rejects.toMatchObject({
    name: 'WalletError',
    code: 'timeout',
    message: WC_TIMEOUT_MESSAGE,
  })
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(hasPendingWalletRequest()).toBe(false)

  // A late wallet answer after the timeout must not blow up (unhandled
  // rejection) nor resurrect the settled guard.
  wallet.resolve('0xlate')
  await Promise.resolve()
})

test('honours a custom timeoutMs', async () => {
  const disconnect = jest.fn().mockResolvedValue(undefined)
  const guarded = guardWcRequest(deferred<string>().promise, { disconnect, timeoutMs: 1_000 })

  jest.advanceTimersByTime(999)
  expect(hasPendingWalletRequest()).toBe(true)
  jest.advanceTimersByTime(1)
  await expect(guarded).rejects.toBeInstanceOf(WalletError)
})

test('abortPendingWalletRequest rejects as a decline and drops the session', async () => {
  const disconnect = jest.fn().mockResolvedValue(undefined)
  const guarded = guardWcRequest(deferred<string>().promise, { disconnect })

  abortPendingWalletRequest()
  await expect(guarded).rejects.toMatchObject({
    name: 'WalletError',
    code: 'declined',
    message: WC_CANCELLED_MESSAGE,
  })
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(hasPendingWalletRequest()).toBe(false)
})

test('abort with nothing in flight is a no-op', () => {
  expect(hasPendingWalletRequest()).toBe(false)
  expect(() => abortPendingWalletRequest()).not.toThrow()
})

test('a hanging or throwing disconnect never blocks the rejection', async () => {
  // Disconnect that neither resolves nor rejects within the test.
  const guardedHang = guardWcRequest(deferred<string>().promise, {
    disconnect: () => new Promise<void>(() => {}),
    timeoutMs: 500,
  })
  jest.advanceTimersByTime(500)
  await expect(guardedHang).rejects.toMatchObject({ code: 'timeout' })

  const guardedThrow = guardWcRequest(deferred<string>().promise, {
    disconnect: jest.fn().mockRejectedValue(new Error('relay dead')),
  })
  abortPendingWalletRequest()
  await expect(guardedThrow).rejects.toMatchObject({ code: 'declined' })
})

test('notifies subscribers when a request starts and when it settles', async () => {
  const events: boolean[] = []
  const unsubscribe = subscribePendingWalletRequest(() => events.push(hasPendingWalletRequest()))

  const wallet = deferred<string>()
  const guarded = guardWcRequest(wallet.promise, { disconnect: jest.fn().mockResolvedValue(undefined) })
  expect(events).toEqual([true])

  wallet.resolve('0xhash')
  await guarded
  expect(events).toEqual([true, false])

  unsubscribe()
  const second = guardWcRequest(deferred<string>().promise, {
    disconnect: jest.fn().mockResolvedValue(undefined),
  })
  expect(events).toEqual([true, false]) // unsubscribed, no further pushes
  abortPendingWalletRequest()
  await expect(second).rejects.toBeInstanceOf(WalletError)
})
