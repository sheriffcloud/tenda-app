/**
 * Market-rate cash-out.
 *
 * The rule under test is that a STALE quote is never submitted: the quote
 * carries the intent the offramp acts against, so confirming on an expired one
 * would settle at a price the reader was never shown. It re-quotes and says so
 * instead.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, type BankAccountSummary } from '@tenda/shared'
import { INSTANT_SELL_COPY, useInstantSell } from '@/hooks/fiat/useInstantSell'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'

const { offramp, replace, toast, quoteState } = vi.hoisted(() => ({
  offramp: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  quoteState: {
    current: {
      quote: { intent_id: 'int-1' } as { intent_id: string } | null,
      expiresIn: 30,
      loading: false,
      error: null as string | null,
      refetch: vi.fn(),
    },
  },
}))
vi.mock('@/api/client', () => ({ api: { fiat: { offramp } } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toast(...a) }))
vi.mock('@/hooks/fiat/useFiatQuote', () => ({ useFiatQuote: () => quoteState.current }))

const option = {
  chainId: 'solana:devnet',
  assetId: 'USDC_SOL',
  symbol: 'USDC',
  decimals: 6,
  walletAddress: 'SoLAddr1',
} as ExchangeAssetOption

const account = { id: 'acc-1', country: 'NG' } as BankAccountSummary

const setup = () =>
  renderHook(() => useInstantSell({ option, amountRaw: '50000000', account }))

beforeEach(() => {
  vi.clearAllMocks()
  quoteState.current = {
    quote: { intent_id: 'int-1' },
    expiresIn: 30,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }
})

describe('useInstantSell', () => {
  it('derives the payout currency from the ACCOUNT, never a default', () => {
    const ng = setup()
    expect(ng.result.current.currency).toBe('NGN')

    const ke = renderHook(() =>
      useInstantSell({ option, amountRaw: '50000000', account: { ...account, country: 'KE' } }),
    )
    expect(ke.result.current.currency).toBe('KES')
  })

  it('submits the quote’s OWN intent id', async () => {
    // A REAL instruction: `FiatInstruction`'s bank arm is 'bank_transfer'.
    offramp.mockResolvedValue({
      intent_id: 'created-1',
      instruction: {
        kind: 'bank_transfer',
        bank_name: 'Zenith',
        account_number: '0123456789',
        account_name: 'Tenda',
        narration: 'TND-1',
      },
    })
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    expect(offramp).toHaveBeenCalledWith({ intent_id: 'int-1', bank_account_id: 'acc-1' })
    expect(replace).toHaveBeenCalledWith('/wallet/intents/created-1')
  })

  it('REFUSES to submit an expired quote — it re-quotes and says so', async () => {
    quoteState.current = { ...quoteState.current, expiresIn: 0 }
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    expect(offramp).not.toHaveBeenCalled()
    expect(quoteState.current.refetch).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith('info', INSTANT_SELL_COPY.restale)
  })

  it('refuses when there is no quote at all', async () => {
    quoteState.current = { ...quoteState.current, quote: null }
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    expect(offramp).not.toHaveBeenCalled()
  })

  it('a P2P instruction is a different DESTINATION, not a failure', async () => {
    // The rail could not fill it, so the server made an offer instead. That is
    // a success with somewhere else to go.
    offramp.mockResolvedValue({
      intent_id: 'unused',
      instruction: { kind: 'p2p', offer_id: 'exch-9' },
    })
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    expect(toast).toHaveBeenCalledWith('success', INSTANT_SELL_COPY.p2pFallback)
    expect(replace).toHaveBeenCalledWith('/exchange/exch-9')
  })

  it('surfaces the server’s own message on a refusal, not a generic one', async () => {
    offramp.mockRejectedValue(new ApiClientError(400, 'Bad Request', 'Amount below the minimum', 'VALIDATION_ERROR'))
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    expect(toast).toHaveBeenCalledWith('error', 'Amount below the minimum')
  })

  it('falls back to its own copy when the failure carries no message', async () => {
    offramp.mockRejectedValue(new Error('socket hang up'))
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    expect(toast).toHaveBeenCalledWith('error', INSTANT_SELL_COPY.failed)
  })

  it('does nothing without an account or an amount', async () => {
    const noAccount = renderHook(() =>
      useInstantSell({ option, amountRaw: '50000000', account: null }),
    )
    await act(async () => {
      await noAccount.result.current.confirm()
    })
    const noAmount = renderHook(() => useInstantSell({ option, amountRaw: null, account }))
    await act(async () => {
      await noAmount.result.current.confirm()
    })
    expect(offramp).not.toHaveBeenCalled()
  })

  it('clears its submitting flag even when the request fails', async () => {
    offramp.mockRejectedValue(new Error('down'))
    const { result } = setup()
    await act(async () => {
      await result.current.confirm()
    })
    await waitFor(() => expect(result.current.submitting).toBe(false))
  })
})
