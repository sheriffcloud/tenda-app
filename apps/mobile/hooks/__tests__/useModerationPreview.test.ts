/**
 * useModerationPreview — debounce, the readiness gate, stale-response
 * discipline, and the silent error path. The verdict is advisory; these tests
 * pin that it can never block or throw.
 *
 * The mobile half of a hook that had a suite on web and none here (#51). Same
 * 800ms debounce, same readiness gate, same POST, so the cases are web's in
 * this harness. The money rule itself (`hasGigBudget`) is covered in
 * @tenda/shared; what is proved here is the hook's orchestration.
 *
 * ONE MECHANISM DIFFERS, which matters to anyone porting between the two:
 * leaving the ready state clears the verdict from inside the EFFECT here,
 * whereas web does it at render time through a `lastReady` comparison —
 * web's effect lint disallows this form. Observably the same, one commit
 * apart, and the advisory hint is unaffected by that frame.
 *
 * ONE FIGURE DIFFERS TOO, and it is NOT drift (#68). The two suites are now
 * case-for-case identical, yet the hook reads 100/93.75/100/100 here against
 * 100/100/100/100 on web. The gap is the cleanup's `if (timer.current)`: its
 * false arm can never be taken, because the cleanup is only returned after
 * `setTimeout` has assigned, and nothing ever nulls the ref. Web's v8 provider
 * does not count that arm; jest's istanbul does. The guard stays — it is what
 * narrows the ref's `null` half, and `clearTimeout(timer.current)` without it
 * is a compile error (TS2769, measured) — so do not "close" this branch with a
 * test. There is no state that reaches it.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { ModerationPreviewBody, ModerationPreviewResponse } from '@tenda/shared'

// Typed on both sides so `mockPreview.mock.calls` carries the real body shape
// rather than `unknown`. NOT because it makes the assertion below compile-
// checked — measured, and it does not: this jest version types
// `toHaveBeenCalledWith` loosely, so renaming a field inside the expected
// object still compiles. The typing that IS enforced is the FIXTURE's (see
// VERDICT).
const mockPreview = jest.fn<Promise<ModerationPreviewResponse>, [ModerationPreviewBody]>()
jest.mock('@/api/client', () => ({
  api: { moderation: { preview: (b: ModerationPreviewBody) => mockPreview(b) } },
}))

import { useModerationPreview, type ModerationPreviewInput } from '@/hooks/useModerationPreview'

const READY: ModerationPreviewInput = {
  title: 'Deliver a package',
  description: 'Careful with it',
  category: 'delivery',
  country: 'NG',
  asset: 'USDC_SOL',
  paymentRaw: '10000000',
}

// Typed, not cast. `as unknown as ModerationPreviewResponse` compiled while
// omitting BOTH `cached` and each reason's `severity`, so every case here was
// asserting a verdict the server cannot send — and would have kept compiling if
// the contract grew another field.
const VERDICT: ModerationPreviewResponse = {
  decision: 'warn',
  reasons: [{ code: 'price', message: 'Low budget', severity: 'warn' }],
  cached: false,
}

beforeEach(() => {
  jest.useFakeTimers()
  mockPreview.mockReset().mockResolvedValue(VERDICT)
})
afterEach(() => {
  jest.useRealTimers()
})

/** Advance past the debounce and let the request's microtasks settle. */
async function debounce() {
  await act(async () => {
    jest.advanceTimersByTime(800)
    await Promise.resolve()
    await Promise.resolve()
  })
}

test('fires after the debounce with trimmed fields and the asset decimals', async () => {
  const { result } = renderHook((input: ModerationPreviewInput) => useModerationPreview(input), {
    initialProps: { ...READY, title: '  Deliver a package  ' },
  })
  expect(result.current).toBeNull()
  expect(mockPreview).not.toHaveBeenCalled()

  await debounce()
  expect(mockPreview).toHaveBeenCalledWith({
    title: 'Deliver a package',
    description: 'Careful with it',
    category: 'delivery',
    country: 'NG',
    asset: 'USDC_SOL',
    amount_raw: '10000000',
    asset_decimals: 6,
  })
  expect(result.current).toEqual(VERDICT)
})

test('not ready (short title / no category / no country / no budget) never calls the API', async () => {
  for (const input of [
    { ...READY, title: 'abc' },
    { ...READY, category: null },
    { ...READY, country: null },
    { ...READY, paymentRaw: '' },
  ]) {
    const { result } = renderHook(() => useModerationPreview(input))
    await debounce()
    expect(result.current).toBeNull()
  }
  expect(mockPreview).not.toHaveBeenCalled()
})

test('leaving the ready state clears the verdict immediately', async () => {
  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce()
  expect(result.current).toEqual(VERDICT)

  // Immediately — not after another debounce. A stale "looks risky" over a
  // budget the reader has just cleared is worse than no hint.
  act(() => rerender({ ...READY, paymentRaw: '' }))
  expect(result.current).toBeNull()
})

test('typing keeps resetting the debounce — one request for a burst of edits', async () => {
  const { rerender } = renderHook((input: ModerationPreviewInput) => useModerationPreview(input), {
    initialProps: READY,
  })
  for (const title of ['Deliver a parcel', 'Deliver a parcel fast', 'Deliver a parcel today']) {
    act(() => {
      jest.advanceTimersByTime(400)
    })
    act(() => rerender({ ...READY, title }))
  }
  await debounce()
  expect(mockPreview).toHaveBeenCalledTimes(1)
  expect(mockPreview).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Deliver a parcel today' }),
  )
})

test('a stale response can never overwrite the latest verdict', async () => {
  let resolveFirst!: (v: ModerationPreviewResponse) => void
  const approve: ModerationPreviewResponse = { decision: 'approve', reasons: [], cached: false }
  mockPreview
    .mockImplementationOnce(() => new Promise<ModerationPreviewResponse>((res) => { resolveFirst = res }))
    .mockResolvedValueOnce(approve)

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce() // first request in flight, unresolved
  act(() => rerender({ ...READY, title: 'Deliver a parcel now' }))
  await debounce() // second request resolves
  expect(result.current).toEqual(approve)

  await act(async () => {
    resolveFirst(VERDICT) // the late first answer — must be dropped
    await Promise.resolve()
  })
  expect(result.current).toEqual(approve)
})

test('an API failure is silent — the hint simply does not show', async () => {
  mockPreview.mockRejectedValue(new Error('500'))
  const { result } = renderHook(() => useModerationPreview(READY))
  await debounce()
  expect(result.current).toBeNull()
})

test('an asset outside the registry still sends decimals — the fallback, not undefined', async () => {
  // `asset_decimals` is required by the route; ASSET_META has no entry for an
  // asset the client has not shipped yet, and sending undefined would be a 422.
  const { result } = renderHook(() => useModerationPreview({ ...READY, asset: 'MYSTERY' }))
  await debounce()
  expect(mockPreview).toHaveBeenCalledWith(expect.objectContaining({ asset_decimals: 9 }))
  expect(result.current).toEqual(VERDICT)
})

test('a superseded request that FAILS cannot clear the newer verdict', async () => {
  // The other half of the stale-response rule. Without the guard in the catch,
  // an abandoned request's rejection wipes the verdict belonging to the input
  // the reader is actually looking at.
  let rejectFirst!: (e: Error) => void
  const approve: ModerationPreviewResponse = { decision: 'approve', reasons: [], cached: false }
  mockPreview
    .mockImplementationOnce(() => new Promise<ModerationPreviewResponse>((_res, rej) => { rejectFirst = rej }))
    .mockResolvedValueOnce(approve)

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce() // first request in flight
  act(() => rerender({ ...READY, title: 'Deliver a parcel now' }))
  await debounce() // second resolves
  expect(result.current).toEqual(approve)

  await act(async () => {
    rejectFirst(new Error('late 500'))
    await Promise.resolve()
  })
  expect(result.current).toEqual(approve)
})

test('a MALFORMED budget never reaches the API — the server answers 422 for it', () => {
  // The gate is hasGigBudget, not `paymentRaw !== ''`, and this is the
  // difference between them. The moderation route validates with isAmountRaw
  // (routes/v1/moderation/preview:38) and rejects anything non-canonical, so
  // every one of these buys a guaranteed 422.
  //
  // NOT an error banner, which this comment used to claim: mobile's request
  // core throws ApiClientError and there is no global interceptor, so the
  // hook's own `.catch` is the last handler and swallows it — errors here are
  // silent by design, exactly as this file's header says. What sending one
  // actually costs is a wasted round trip per keystroke burst, and a verdict
  // that stays null for a reason the reader cannot see. The gate is still
  // right; the consequence was overstated.
  for (const paymentRaw of ['0', 'abc', '1.5', '-1', '1e6', ' 1000000', '01000000']) {
    renderHook(() => useModerationPreview({ ...READY, paymentRaw }))
    act(() => {
      jest.advanceTimersByTime(2000)
    })
  }
  expect(mockPreview).not.toHaveBeenCalled()
})

test('a request already IN FLIGHT cannot bring the hint back after readiness is lost', async () => {
  // The gap between the two rules this file already pins. Leaving the ready
  // state clears the verdict, and a superseded request is dropped by sequence —
  // but losing readiness supersedes nothing, so the answer to the input the
  // reader has just abandoned still matched the sequence and set itself. The
  // "looks risky" hint reappeared over a budget that was no longer there.
  let resolveIt!: (v: ModerationPreviewResponse) => void
  mockPreview.mockImplementationOnce(
    () => new Promise<ModerationPreviewResponse>((res) => { resolveIt = res }),
  )

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce()
  act(() => rerender({ ...READY, paymentRaw: '' }))
  expect(result.current).toBeNull()

  await act(async () => {
    resolveIt(VERDICT)
    await Promise.resolve()
  })
  expect(result.current).toBeNull()
})

test('nor after readiness is lost and REGAINED — the answer belongs to the abandoned input', async () => {
  // The sibling state, and the reason the invalidation cannot simply be "clear
  // the verdict on the way out": the reader clears the budget and types a new
  // one, so `ready` is true again when the OLD request lands. Its sequence
  // still matched, and its verdict — computed for a budget that is no longer on
  // screen — showed until the fresh debounce replaced it 800ms later. Mobile is
  // protected by the same `++requestSeq.current` web is, and now pins it too
  // (#68); this is web's case in this harness.
  let resolveIt!: (v: ModerationPreviewResponse) => void
  mockPreview.mockImplementationOnce(
    () => new Promise<ModerationPreviewResponse>((res) => { resolveIt = res }),
  )

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce()
  act(() => rerender({ ...READY, paymentRaw: '' }))
  act(() => rerender({ ...READY, paymentRaw: '25000000' }))

  await act(async () => {
    resolveIt(VERDICT)
    await Promise.resolve()
  })
  expect(result.current).toBeNull()
})
