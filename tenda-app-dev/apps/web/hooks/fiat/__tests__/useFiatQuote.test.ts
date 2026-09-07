/**
 * The quote hook, whose whole job is that a reader never acts on a price that
 * is not theirs any more.
 *
 * Four properties, each of which was a real decision: typing is debounced but a
 * manual refetch is not; a slow response for an amount already changed is
 * DROPPED; a quote belongs to the inputs it was fetched for and stops counting
 * the moment they change; and "the rails are off" is a different answer from
 * "the request broke", because only one of them is worth retrying.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@tenda/shared'
import { useFiatQuote, type FiatQuoteInput } from '@/hooks/fiat/useFiatQuote'

const quoteMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { fiat: { quote: quoteMock } } }))

const INPUT: FiatQuoteInput = {
  direction: 'offramp',
  asset: 'USDC_SOL',
  chainId: 'solana:devnet',
  walletAddress: 'SoLAddr1',
  fiatCurrency: 'NGN',
  assetAmountRaw: '50000000',
}

const answer = (over: Record<string, unknown> = {}) => ({
  intent_id: 'int-1',
  provider: 'p2p',
  rate: 1500,
  fee_amount: 100,
  fiat_amount: 75_000,
  asset_amount_raw: '50000000',
  kyc_required: false,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  quoteMock.mockReset()
  quoteMock.mockResolvedValue(answer())
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useFiatQuote', () => {
  it('asks for nothing until every input is present', async () => {
    renderHook(() => useFiatQuote(null))
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    expect(quoteMock).not.toHaveBeenCalled()
  })

  it('refuses a zero or empty amount — there is no price for nothing', async () => {
    for (const assetAmountRaw of ['0', '']) {
      renderHook(() => useFiatQuote({ ...INPUT, assetAmountRaw }))
      await act(async () => {
        vi.advanceTimersByTime(2_000)
      })
    }
    expect(quoteMock).not.toHaveBeenCalled()
  })

  it('debounces typing into ONE request', async () => {
    const { rerender } = renderHook(({ raw }: { raw: string }) => useFiatQuote({ ...INPUT, assetAmountRaw: raw }), {
      initialProps: { raw: '1' },
    })
    rerender({ raw: '12' })
    rerender({ raw: '123' })
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    expect(quoteMock).toHaveBeenCalledTimes(1)
    expect(quoteMock).toHaveBeenCalledWith(expect.objectContaining({ asset_amount_raw: '123' }))
  })

  it('reads as LOADING the instant the inputs change, not a frame later', () => {
    const { result, rerender } = renderHook(
      ({ raw }: { raw: string }) => useFiatQuote({ ...INPUT, assetAmountRaw: raw }),
      { initialProps: { raw: '50000000' } },
    )
    rerender({ raw: '60000000' })
    // Derived during render: the stored answer belongs to the previous amount.
    expect(result.current.loading).toBe(true)
    expect(result.current.quote).toBeNull()
  })

  it('never shows the PREVIOUS amount’s quote as if it were the new one', async () => {
    const { result, rerender } = renderHook(
      ({ raw }: { raw: string }) => useFiatQuote({ ...INPUT, assetAmountRaw: raw }),
      { initialProps: { raw: '50000000' } },
    )
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await waitFor(() => expect(result.current.quote).not.toBeNull())

    rerender({ raw: '99000000' })
    expect(result.current.quote).toBeNull()
  })

  it('drops a response that lands after its inputs are stale', async () => {
    let resolveFirst: ((v: unknown) => void) | null = null
    quoteMock.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    quoteMock.mockResolvedValueOnce(answer({ intent_id: 'int-2', fiat_amount: 99 }))

    const { result, rerender } = renderHook(
      ({ raw }: { raw: string }) => useFiatQuote({ ...INPUT, assetAmountRaw: raw }),
      { initialProps: { raw: '50000000' } },
    )
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    rerender({ raw: '60000000' })
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    // The FIRST request answers last. It must not repaint the panel.
    await act(async () => {
      resolveFirst?.(answer({ intent_id: 'int-1', fiat_amount: 1 }))
    })
    await waitFor(() => expect(result.current.quote?.intent_id).toBe('int-2'))
  })

  it('separates "the rails are off" from "the request broke"', async () => {
    quoteMock.mockRejectedValueOnce(
      new ApiClientError(503, 'Service Unavailable', 'off', 'FIAT_RAILS_DISABLED'),
    )
    const off = renderHook(() => useFiatQuote(INPUT))
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await waitFor(() => expect(off.result.current.error).toBe('unavailable'))

    quoteMock.mockRejectedValueOnce(new Error('socket hang up'))
    const broke = renderHook(() => useFiatQuote({ ...INPUT, assetAmountRaw: '70000000' }))
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await waitFor(() => expect(broke.result.current.error).toBe('failed'))
  })

  it('refetches IMMEDIATELY on demand — the debounce is only for typing', async () => {
    const { result } = renderHook(() => useFiatQuote(INPUT))
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await waitFor(() => expect(quoteMock).toHaveBeenCalledTimes(1))

    act(() => result.current.refetch())
    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(quoteMock).toHaveBeenCalledTimes(2)
  })

  it('counts the quote down, and reports it expired rather than still valid', async () => {
    quoteMock.mockResolvedValue(answer({ expires_at: new Date(Date.now() + 2_000).toISOString() }))
    const { result } = renderHook(() => useFiatQuote(INPUT))
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await waitFor(() => expect(result.current.expiresIn).toBeGreaterThan(0))

    await act(async () => {
      vi.advanceTimersByTime(4_000)
    })
    await waitFor(() => expect(result.current.expiresIn).toBe(0))
  })
})
