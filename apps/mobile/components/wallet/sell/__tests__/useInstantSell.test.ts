/**
 * useInstantSell — instant cash-out quote + confirm. Verifies a stale/absent
 * quote blocks submit (nudge, no offramp call), a fresh P2P quote routes to the
 * new offer, and a licensed-provider intent routes to the intent screen.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

type QuoteState = { quote: unknown; expiresIn: number; loading: boolean; error: string | null }
let mockQuoteState: QuoteState = { quote: null, expiresIn: 0, loading: false, error: null }
const mockOfframp = jest.fn()
const mockReplace = jest.fn()
const mockToast = jest.fn()
const mockRefetch = jest.fn()
// Captures what the hook ASKS FOR, not just what it gets back: passing null
// means "do not quote", which is the behaviour when no currency is resolved.
// The `mock` prefix is required — jest hoists the factory above these consts.
const mockQuoteArgs = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }))
// Mirrors the real hook, which returns `{ ...state, refetch }`. Omitting
// refetch here made the stale-quote branch throw instead of nudging.
jest.mock('@/hooks/useFiatQuote', () => ({
  useFiatQuote: (args: unknown) => {
    mockQuoteArgs(args)
    return { ...mockQuoteState, refetch: mockRefetch }
  },
}))
jest.mock('@/api/client', () => ({
  api: { fiat: { offramp: (b: unknown) => mockOfframp(b) } },
  ApiClientError: jest.requireActual('@tenda/shared').ApiClientError,
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
  mockQuoteArgs.mockReset()
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

test('exposes the payout CURRENCY derived from the account country', () => {
  // The code, not a symbol: the shared formatters take the code and own symbol
  // placement, which differs by currency (prefix for ₦, suffix for €).
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  expect(result.current.currency).toBe('NGN')
})

test('confirm is a no-op with no option/amount/account (nothing to quote)', async () => {
  const { result } = renderHook(() => useInstantSell({ option: null, amountRaw: null, account: null }))
  await act(async () => { await result.current.confirm() })
  expect(mockOfframp).not.toHaveBeenCalled()
  expect(mockToast).not.toHaveBeenCalled() // guarded before the stale-quote nudge
})

/**
 * There is no default payout currency any more. It used to answer NGN with no
 * account selected, which showed a Kenyan seller a naira label on an empty
 * form — and, on the server, made an unrecognised country look Nigerian to the
 * offer guard. The account's country is the only thing that knows.
 */
test('reports no currency until a payout account is chosen', () => {
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: null }))
  expect(result.current.currency).toBeNull()
})

test('does not request a quote while the currency is unknown', () => {
  renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: null }))
  // A quote priced in a guessed currency is worse than no quote.
  expect(mockQuoteArgs).toHaveBeenCalledWith(null)
})

test('requests a quote in the account currency once an account is chosen', () => {
  renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: ACCOUNT }))
  expect(mockQuoteArgs).toHaveBeenCalledWith(expect.objectContaining({ fiatCurrency: 'NGN' }))
})

/**
 * The case the `account !== null` conjunct cannot reach. A retired market is a
 * REAL account — chosen, saved, with an id and a country — whose country no
 * longer resolves to a currency, so it is the only input for which the second
 * conjunct is the one doing the work. Without it the hook asks for a quote
 * priced in `null`; with `account: null` above, the first conjunct short-
 * circuits and the guard would look tested while being unproven.
 */
test('does not request a quote for an account in a retired market', () => {
  const retired = { ...ACCOUNT, country: 'ZW' } as BankAccountSummary
  const { result } = renderHook(() => useInstantSell({ option: OPTION, amountRaw: '2500000', account: retired }))
  expect(result.current.currency).toBeNull()
  expect(mockQuoteArgs).toHaveBeenCalledWith(null)
})
