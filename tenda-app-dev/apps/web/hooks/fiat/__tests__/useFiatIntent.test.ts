/**
 * One intent, polled while it is still moving.
 *
 * Three properties: polling STOPS at a terminal status rather than asking
 * forever; a 404 is `gone` and is an answer; and a TRANSIENT failure keeps the
 * last known intent, because an outage must not blank a page that was showing
 * someone their money.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, type FiatIntentDetail } from '@tenda/shared'
import { FIAT_INTENT_COPY, useFiatIntent } from '@/hooks/fiat/useFiatIntent'

const { intentGet, cancelIntent, toast } = vi.hoisted(() => ({
  intentGet: vi.fn(),
  cancelIntent: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/api/client', () => ({ api: { fiat: { intent: intentGet, cancelIntent } } }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toast(...a) }))

const detail = (over: Partial<FiatIntentDetail> = {}): FiatIntentDetail =>
  ({
    id: 'int-1',
    direction: 'offramp',
    status: 'awaiting_provider',
    provider: 'rail-x',
    fiat_currency: 'NGN',
    fiat_amount: '75000.0000',
    asset: 'USDC_SOL',
    asset_amount_raw: '50000000',
    rate: '1500.0000000000',
    fee_amount: '100.0000',
    kyc_required: false,
    kyc_url: null,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    instruction: null,
    created_at: '2026-08-18T09:00:00.000Z',
    ...over,
  }) as FiatIntentDetail

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
  intentGet.mockResolvedValue(detail())
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useFiatIntent', () => {
  it('loads the intent', async () => {
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent?.id).toBe('int-1'))
    expect(result.current.gone).toBe(false)
  })

  it('keeps POLLING while the intent is still moving', async () => {
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent).not.toBeNull())
    expect(intentGet).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    await waitFor(() => expect(intentGet).toHaveBeenCalledTimes(2))
  })

  it('STOPS polling once the intent has settled', async () => {
    intentGet.mockResolvedValue(detail({ status: 'settled' }))
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent?.status).toBe('settled'))

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(intentGet).toHaveBeenCalledTimes(1)
  })

  it('a 404 is GONE — a state, not a spinner', async () => {
    intentGet.mockRejectedValue(new ApiClientError(404, 'Not Found', 'no such intent', 'NOT_FOUND'))
    const { result } = renderHook(() => useFiatIntent('nope'))
    await waitFor(() => expect(result.current.gone).toBe(true))
    expect(result.current.loading).toBe(false)
  })

  it('a TRANSIENT failure keeps the last known intent on screen', async () => {
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent).not.toBeNull())

    intentGet.mockRejectedValue(new Error('socket hang up'))
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    // Still there, and NOT reported gone.
    expect(result.current.intent?.id).toBe('int-1')
    expect(result.current.gone).toBe(false)
  })

  it('cancelling re-reads, so the page shows the new status rather than assuming it', async () => {
    cancelIntent.mockResolvedValue({ cancelled: true })
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent).not.toBeNull())
    intentGet.mockClear()

    await act(async () => {
      await result.current.cancel()
    })
    expect(cancelIntent).toHaveBeenCalledWith({ id: 'int-1' })
    await waitFor(() => expect(intentGet).toHaveBeenCalled())
  })

  it('reports a refused cancellation with the server’s own words', async () => {
    cancelIntent.mockRejectedValue(
      new ApiClientError(409, 'Conflict', 'Already settling', 'CONFLICT'),
    )
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent).not.toBeNull())
    await act(async () => {
      await result.current.cancel()
    })
    expect(toast).toHaveBeenCalledWith('error', 'Already settling')
  })

  it('falls back to its own copy when the refusal carries no message', async () => {
    cancelIntent.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent).not.toBeNull())
    await act(async () => {
      await result.current.cancel()
    })
    expect(toast).toHaveBeenCalledWith('error', FIAT_INTENT_COPY.cancelFailed)
  })

  it('asks for nothing without an id', async () => {
    renderHook(() => useFiatIntent(undefined))
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(intentGet).not.toHaveBeenCalled()
  })

  it('stops polling on unmount', async () => {
    const { result, unmount } = renderHook(() => useFiatIntent('int-1'))
    await waitFor(() => expect(result.current.intent).not.toBeNull())
    intentGet.mockClear()
    unmount()
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(intentGet).not.toHaveBeenCalled()
  })
})
