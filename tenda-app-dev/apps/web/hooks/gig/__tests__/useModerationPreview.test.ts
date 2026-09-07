/**
 * useModerationPreview — debounce, the readiness gate, stale-response
 * discipline, and the silent error path. The verdict is advisory; these
 * tests pin that it can never block or throw.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ModerationPreviewBody, ModerationPreviewResponse } from '@tenda/shared'

// Typed on both sides so `previewMock.mock.calls` carries the real body shape
// rather than `unknown`. NOT because it makes the assertions below compile-
// checked: measured on THIS runner, not inferred from mobile's — misspelling a
// field inside a `toHaveBeenCalledWith` object still type-checks under vitest 3
// exactly as it does under jest, so that matcher enforces nothing here.
// What the typing DOES enforce is the fixtures: with `previewMock` typed, a
// `mockResolvedValueOnce` of a verdict missing `cached` is a compile error
// (checked — TS2345 at both stale-response cases). See VERDICT and APPROVE.
const { previewMock } = vi.hoisted(() => ({
  previewMock:
    vi.fn<(body: ModerationPreviewBody) => Promise<ModerationPreviewResponse>>(),
}))
vi.mock('@/api/client', () => ({
  api: { moderation: { preview: (body: ModerationPreviewBody) => previewMock(body) } },
}))

import { useModerationPreview, type ModerationPreviewInput } from '@/hooks/gig/useModerationPreview'

const READY: ModerationPreviewInput = {
  title: 'Deliver a package',
  description: 'Careful with it',
  category: 'delivery',
  country: 'NG',
  asset: 'USDC_SOL',
  paymentRaw: '10000000',
}

// Typed, so the compiler holds it to the wire shape: an untyped literal here
// omitted both `cached` and each reason's `severity`, which the contract
// requires and the route always sends. The cases below resolve the mocked
// request with it, so an unchecked fixture is a verdict the server cannot emit.
const VERDICT: ModerationPreviewResponse = {
  decision: 'warn',
  reasons: [{ code: 'price', message: 'Low budget', severity: 'warn' }],
  cached: false,
}

/** The clean verdict a newer request answers with. Typed for the same reason. */
const APPROVE: ModerationPreviewResponse = { decision: 'approve', reasons: [], cached: false }

beforeEach(() => {
  vi.useFakeTimers()
  previewMock.mockResolvedValue(VERDICT)
})
afterEach(() => vi.useRealTimers())

async function debounce() {
  await act(async () => {
    vi.advanceTimersByTime(800)
    await Promise.resolve()
    await Promise.resolve()
  })
}

test('fires after the debounce with trimmed fields and the asset decimals', async () => {
  const { result } = renderHook((input: ModerationPreviewInput) => useModerationPreview(input), {
    initialProps: { ...READY, title: '  Deliver a package  ' },
  })
  expect(result.current).toBeNull()
  expect(previewMock).not.toHaveBeenCalled()
  await debounce()
  expect(previewMock).toHaveBeenCalledWith({
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
  expect(previewMock).not.toHaveBeenCalled()
})

test('leaving the ready state clears the verdict immediately', async () => {
  const { result, rerender } = renderHook((input: ModerationPreviewInput) => useModerationPreview(input), {
    initialProps: READY,
  })
  await debounce()
  expect(result.current).toEqual(VERDICT)
  rerender({ ...READY, paymentRaw: '' })
  expect(result.current).toBeNull()
})

test('typing keeps resetting the debounce — one request for a burst of edits', async () => {
  const { rerender } = renderHook((input: ModerationPreviewInput) => useModerationPreview(input), {
    initialProps: READY,
  })
  for (const title of ['Deliver a parcel', 'Deliver a parcel fast', 'Deliver a parcel today']) {
    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender({ ...READY, title })
  }
  await debounce()
  expect(previewMock).toHaveBeenCalledTimes(1)
  expect(previewMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deliver a parcel today' }))
})

test('a stale response can never overwrite the latest verdict', async () => {
  let resolveFirst!: (v: ModerationPreviewResponse) => void
  previewMock
    .mockImplementationOnce(
      () => new Promise<ModerationPreviewResponse>((res) => { resolveFirst = res }),
    )
    .mockResolvedValueOnce(APPROVE)
  const { result, rerender } = renderHook((input: ModerationPreviewInput) => useModerationPreview(input), {
    initialProps: READY,
  })
  await debounce() // first request in flight, unresolved
  rerender({ ...READY, title: 'Deliver a parcel now' })
  await debounce() // second request resolves
  expect(result.current).toEqual(APPROVE)
  await act(async () => {
    resolveFirst(VERDICT) // late first answer — must be dropped
    await Promise.resolve()
  })
  expect(result.current).toEqual(APPROVE)
})

test('an API failure is silent — the hint simply does not show', async () => {
  previewMock.mockRejectedValue(new Error('500'))
  const { result } = renderHook(() => useModerationPreview(READY))
  await debounce()
  expect(result.current).toBeNull()
})

test('an asset outside the registry still sends decimals — the fallback, not undefined', async () => {
  // `asset_decimals` is required by the route; ASSET_META has no entry for an
  // asset the client has not shipped yet, and sending undefined would be a 422.
  // Unreachable in production — assertManifestValid refuses at import any chain
  // asset missing from ASSET_META (the #50 re-audit) — but the fallback is the
  // hook's last uncovered branch, and mobile pins it, which is the parity.
  const { result } = renderHook(() => useModerationPreview({ ...READY, asset: 'MYSTERY' }))
  await debounce()
  expect(previewMock).toHaveBeenCalledWith(expect.objectContaining({ asset_decimals: 9 }))
  expect(result.current).toEqual(VERDICT)
})

test('a superseded request that FAILS cannot clear the newer verdict', async () => {
  // The other half of the stale-response rule. Without the guard in the catch,
  // an abandoned request's rejection wipes the verdict belonging to the input
  // the reader is actually looking at.
  let rejectFirst!: (e: Error) => void
  previewMock
    .mockImplementationOnce(
      () => new Promise<ModerationPreviewResponse>((_res, rej) => { rejectFirst = rej }),
    )
    .mockResolvedValueOnce(APPROVE)

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce() // first request in flight
  rerender({ ...READY, title: 'Deliver a parcel now' })
  await debounce() // second resolves
  expect(result.current).toEqual(APPROVE)

  await act(async () => {
    rejectFirst(new Error('late 500'))
    await Promise.resolve()
  })
  expect(result.current).toEqual(APPROVE)
})

test('a MALFORMED budget never reaches the API — the server answers 422 for it', () => {
  // The gate is hasGigBudget, not `paymentRaw !== ''`, and this is the
  // difference between them. The moderation route validates with isAmountRaw
  // and rejects anything non-canonical, so every one of these buys a
  // guaranteed 422.
  //
  // NOT an error banner, which this comment used to claim: `api/request.ts`
  // throws ApiClientError on a non-ok response and web has no interceptor
  // above it, so the hook's own `.catch` is the last handler and swallows it —
  // errors here are silent by design, exactly as this file's header says. What
  // sending one actually costs is a wasted round trip per keystroke burst, and
  // a verdict that stays null for a reason the reader cannot see. The gate is
  // still right; the consequence was overstated. (Mobile's copy of this comment
  // was corrected in 781cd64; this is the same correction, verified against
  // web's own request core rather than assumed from mobile's.)
  for (const paymentRaw of ['0', 'abc', '1.5', '-1', '1e6', ' 1000000', '01000000']) {
    renderHook(() => useModerationPreview({ ...READY, paymentRaw }))
    act(() => { vi.advanceTimersByTime(2000) })
  }
  expect(previewMock).not.toHaveBeenCalled()
})

test('a request already IN FLIGHT cannot bring the hint back after readiness is lost', async () => {
  // The gap between the two rules above. Leaving the ready state clears the
  // verdict, and a superseded request is dropped by sequence — but losing
  // readiness supersedes nothing, so the answer to the input the reader has
  // just abandoned still matched the sequence and set itself. The "looks risky"
  // hint reappeared over a budget that was no longer there. Same case, same
  // wording, as mobile's (#67 / #51).
  let resolveIt!: (v: ModerationPreviewResponse) => void
  previewMock.mockImplementationOnce(
    () => new Promise<ModerationPreviewResponse>((res) => { resolveIt = res }),
  )

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce()
  rerender({ ...READY, paymentRaw: '' })
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
  // still matched, and its verdict — computed for a budget that is no longer
  // on screen — showed until the fresh debounce replaced it 800ms later.
  let resolveIt!: (v: ModerationPreviewResponse) => void
  previewMock.mockImplementationOnce(
    () => new Promise<ModerationPreviewResponse>((res) => { resolveIt = res }),
  )

  const { result, rerender } = renderHook(
    (input: ModerationPreviewInput) => useModerationPreview(input),
    { initialProps: READY },
  )
  await debounce()
  rerender({ ...READY, paymentRaw: '' })
  rerender({ ...READY, paymentRaw: '25000000' })

  await act(async () => {
    resolveIt(VERDICT)
    await Promise.resolve()
  })
  expect(result.current).toBeNull()
})
