/**
 * useExchangeDetail — what a refetch failure does to the offer already on
 * screen.
 *
 * The hook refetches on every focus, so a failure here is not a first-load
 * failure: there is usually a good offer rendered behind it. Whether that offer
 * survives is the whole behaviour. It must NOT survive a 404 — the offer was
 * deleted, or taken down and no longer readable by this viewer, and the screen
 * would otherwise keep an Accept button live over a listing the server has
 * stopped serving. It MUST survive anything else, or a lost packet blanks a
 * perfectly good screen.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { ExchangeDetail } from '@tenda/shared'
import { ApiClientError } from '@tenda/shared'
import { exchangeDetail } from '@/components/exchange/__fixtures__/exchange-detail'

const mockGet = jest.fn()
jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { exchange: { get: (...args: unknown[]) => mockGet(...args) } },
}))

// Captured so a test can re-fire it — the second focus IS the refetch.
let focusCb: (() => void) | null = null
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    focusCb = cb
  },
}))

import { useExchangeDetail } from '@/hooks/useExchangeDetail'

const OFFER: ExchangeDetail = exchangeDetail({ escrow_id: 'offer-1' })

beforeEach(() => {
  focusCb = null
  mockGet.mockReset()
})

/** Mount, run the focus effect, and wait for the first response to land. */
async function mountLoaded() {
  mockGet.mockResolvedValue(OFFER)
  const hook = renderHook(() => useExchangeDetail('offer-1'))
  await act(async () => {
    focusCb?.()
  })
  await waitFor(() => expect(hook.result.current.offer).toEqual(OFFER))
  return hook
}

test('loads the offer and clears the loading flag', async () => {
  const { result } = await mountLoaded()
  expect(mockGet).toHaveBeenCalledWith({ id: 'offer-1' })
  expect(result.current.isLoading).toBe(false)
  expect(result.current.error).toBeNull()
})

test('an absent id fetches nothing', async () => {
  renderHook(() => useExchangeDetail(undefined))
  await act(async () => {
    focusCb?.()
  })
  expect(mockGet).not.toHaveBeenCalled()
})

test('a 404 refetch DROPS the offer it was refreshing', async () => {
  const { result } = await mountLoaded()

  mockGet.mockRejectedValue(new ApiClientError(404, 'Not Found', 'Offer not found', 'NOT_FOUND'))
  await act(async () => {
    await result.current.refresh()
  })

  expect(result.current.offer).toBeNull()
  expect(result.current.error).toEqual({ message: 'Offer not found', gone: true })
})

test('a NETWORK refetch keeps the offer on screen', async () => {
  const { result } = await mountLoaded()

  mockGet.mockRejectedValue(new Error('Network request failed'))
  await act(async () => {
    await result.current.refresh()
  })

  expect(result.current.offer).toEqual(OFFER)
  expect(result.current.error?.gone).toBe(false)
})

test('a 500 refetch keeps the offer too', async () => {
  const { result } = await mountLoaded()

  mockGet.mockRejectedValue(new ApiClientError(500, 'Internal', 'Boom', 'INTERNAL_ERROR'))
  await act(async () => {
    await result.current.refresh()
  })

  expect(result.current.offer).toEqual(OFFER)
  expect(result.current.error?.gone).toBe(false)
})

test('a successful refetch clears a previous failure', async () => {
  const { result } = await mountLoaded()
  mockGet.mockRejectedValue(new Error('Network request failed'))
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.error).not.toBeNull()

  const updated: ExchangeDetail = { ...OFFER, hidden: true }
  mockGet.mockResolvedValue(updated)
  await act(async () => {
    await result.current.refresh()
  })

  expect(result.current.error).toBeNull()
  // And the takedown flag rides in on the ordinary refetch — no extra plumbing.
  expect(result.current.offer?.hidden).toBe(true)
})

test('a SUPERSEDED response never paints over a newer one', async () => {
  // Mirrors the gigs.store guard. Unreachable through today's navigation (every
  // route into this screen mounts a fresh instance), so this pins the invariant
  // at the hook instead of leaving it to depend on that staying true.
  const { result } = await mountLoaded()

  // A SYNCHRONOUS `act`, not an async one: leaving an async act scope open
  // while a second runs makes React swallow the inner update (the test then
  // fails for a reason unrelated to the guard), but calling refresh with no act
  // at all leaves its first `setError(null)` outside act and warns.
  let resolveSlow: (v: unknown) => void = () => {}
  mockGet.mockReturnValueOnce(new Promise((resolve) => { resolveSlow = resolve }))
  let slow: Promise<void> = Promise.resolve()
  act(() => {
    slow = result.current.refresh()
  })

  const newer: ExchangeDetail = { ...OFFER, fiat_amount: '999999' }
  mockGet.mockResolvedValueOnce(newer)
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.offer).toEqual(newer)

  // The slow one lands LAST and must be thrown away.
  await act(async () => {
    resolveSlow({ ...OFFER, fiat_amount: '1' })
    await slow
  })

  expect(result.current.offer).toEqual(newer)
})

test('a superseded response leaves the FIRST-LOAD spinner alone', async () => {
  // `isLoading` is only ever set false in this hook, so the spinner exists only
  // during the first load — which is precisely when two focus fires can overlap.
  // If the older response cleared it, the screen would show its empty state
  // ("Offer not available", since `offer` is still null) for as long as the
  // newer request takes, then flash the offer in.
  //
  // The "still true" assertion below would pass vacuously on its own, because
  // `isLoading` starts true — its teeth come from the mutation check: remove
  // the `finally` guard and this test fails.
  let resolveOld: (v: unknown) => void = () => {}
  let resolveNew: (v: unknown) => void = () => {}
  mockGet.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
  const { result } = renderHook(() => useExchangeDetail('offer-1'))

  act(() => {
    focusCb?.() // request 1, slow
  })
  mockGet.mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve }))
  let newer: Promise<void> = Promise.resolve()
  act(() => {
    newer = result.current.refresh() // request 2, also in flight
  })

  // Request 1 lands while 2 is still running: superseded, so it must touch
  // nothing — not the offer, and not the spinner that belongs to request 2.
  await act(async () => {
    resolveOld(OFFER)
    await Promise.resolve()
  })
  expect(result.current.isLoading).toBe(true)
  expect(result.current.offer).toBeNull()

  await act(async () => {
    resolveNew({ ...OFFER, fiat_amount: '999999' })
    await newer
  })
  expect(result.current.isLoading).toBe(false)
  expect(result.current.offer?.fiat_amount).toBe('999999')
})
