/**
 * useInstantSell — instant cash-out quote + confirm. Verifies a stale/absent
 * quote blocks submit (nudge, no offramp call), a fresh P2P quote routes to the
 * new offer, and a licensed-provider intent routes to the intent screen.
 */
import { renderHook, act } from '@testing-library/react-native'
import { DEFAULT_PAYOUT_CURRENCY } from '@tenda/shared'
import type { BankAccountSummary } from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

type QuoteState = { quote: unknown; expiresIn: number; loading: boolean; error: string | null }
let mockQuoteState: QuoteState = { quote: null, expiresIn: 0, loading: false, error: null }
const mockOfframp = jest.fn()
const mockReplace = jest.fn()
const mockToast = jest.fn()
const mockRefetch = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }))
// Mirrors the real hook, which returns `{ ...state, refetch }`. Omitting
// refetch here made the stale-quote branch throw instead of nudging.
jest.mock('@/hooks/useFiatQuote', () => ({
  useFiatQuote: () => ({ ...mockQuoteState, refetch: mockRefetch }),
}))
jest.mock('@/api/client', () => ({
  api: { fiat: { offramp: (b: unknown) => mockOfframp(b) } },
  ApiClientError: class ApiClientError extends Error {},
}))
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))

import { useInstantSell } from '../useInstantSell'

const OPTION = { chainId: 'solana:devnet', assetId: 'USDC_SOL', symbol: 'USDC', decimals: 6, chainName: 'Solana', walletAddress: 'sol1' } as ExchangeAssetOption
const ACCOUNT = { id: 'acc1', country: 'NG' } as BankAccountSummary

beforeEach(() => {
  mockQuoteState = { quote: null, expiresIn: 0, loading: false, error: null }
  mockOfframp.mockReset().mockResolvedValue({ instruction: { kind: 'p2p', offer_id: 'off-1' }, intent_id: 'i1' })
  mockReplace.mockReset()
  mockToast.mockReset()
  mockRefetch.mockReset()
})

test('blocks submit and nudges when there is no fresh quote', async () => {
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  await act(async () => { await result.current.confirm() })
  expect(mockOfframp).not.toHaveBeenCalled()
  expect(mockToast).toHaveBeenCalledWith('info', expect.stringMatching(/latest price/i))
  // The nudge is only honest if a fresh quote is actually on the way.
  expect(mockRefetch).toHaveBeenCalledTimes(1)
})

test('a fresh P2P quote initiates the offramp and routes to the new offer', async () => {
  mockQuoteState = { quote: { intent_id: 'q1', provider: 'p2p_internal' }, expiresIn: 300, loading: false, error: null }
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  await act(async () => { await result.current.confirm() })
  expect(mockOfframp).toHaveBeenCalledWith({ intent_id: 'q1', bank_account_id: 'acc1' })
  expect(mockReplace).toHaveBeenCalledWith('/exchange/off-1')
})

test('a licensed-provider intent routes to the intent screen', async () => {
  mockQuoteState = { quote: { intent_id: 'q2' }, expiresIn: 300, loading: false, error: null }
  mockOfframp.mockResolvedValue({ instruction: { deposit: 'x' }, intent_id: 'i2' })
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  await act(async () => { await result.current.confirm() })
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/wallet/intents/[id]', params: { id: 'i2' } })
})

test('surfaces an error toast when the offramp call fails', async () => {
  mockQuoteState = { quote: { intent_id: 'q3' }, expiresIn: 300, loading: false, error: null }
  mockOfframp.mockRejectedValue(new Error('boom'))
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  await act(async () => { await result.current.confirm() })
  expect(mockToast).toHaveBeenCalledWith('error', expect.any(String))
})

test('exposes the NGN currency symbol derived from the account country', () => {
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  expect(result.current.currency).toBe('NGN')
  expect(result.current.currencySymbol).toBe('₦')
})

test('confirm is a no-op with no option/amount/account (nothing to quote)', async () => {
  const { result } = renderHook(() => useInstantSell({ option: null, amountRaw: null, account: null }))
  await act(async () => { await result.current.confirm() })
  expect(mockOfframp).not.toHaveBeenCalled()
  expect(mockToast).not.toHaveBeenCalled() // guarded before the stale-quote nudge
})

test('falls back to the default payout currency when there is no account', () => {
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: null }))
  expect(result.current.currency).toBe(DEFAULT_PAYOUT_CURRENCY)
})
