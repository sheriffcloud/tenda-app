/**
 * The 9D first-transaction gate on the offer-creation path.
 *
 * This hook had NO suite at all, so the branch #60 changed was unguarded on
 * this client: the wallet gate must keep the composition instead of pushing
 * the reader into Settings with the whole offer — asset, amount, rate, payout
 * account — left behind.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockToast = jest.fn()
const mockRefreshMe = jest.fn(async () => {})
const mockEscrowCreate = jest.fn()
const mockEscrowDelete = jest.fn()
const mockExchangeCreate = jest.fn()
const mockSign = jest.fn()
const mockEnsureBalance = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ refreshMe: mockRefreshMe }) },
}))
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
jest.mock('@/wallet/dispatch', () => ({
  settleSignerFor: jest.fn(),
  declaredSignerFor: () => 'SoLAddr1',
  resolveSignersForChain: () => ['SoLAddr1'],
  signSendAndReport: (...a: unknown[]) => mockSign(...a),
}))
jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: (...a: unknown[]) => mockEnsureBalance(...a),
}))
jest.mock('@/api/client', () => ({
  api: {
    escrows: {
      create: (b: unknown) => mockEscrowCreate(b),
      delete: (b: unknown) => mockEscrowDelete(b),
    },
    exchange: { create: (b: unknown) => mockExchangeCreate(b) },
  },
  // The REAL shared class — the hook narrows `instanceof` against it.
  ApiClientError: jest.requireActual('@tenda/shared').ApiClientError,
}))

// eslint-disable-next-line import/first
import { ApiClientError, TRANSACTION_GATE_MESSAGE } from '@tenda/shared'
// eslint-disable-next-line import/first
import { useOfferSell } from '../useOfferSell'

const ARGS = {
  option: {
    chainId: 'solana:devnet',
    assetId: 'USDC_SOL',
    symbol: 'USDC',
    decimals: 6,
    chainName: 'Solana',
    walletAddress: 'SoLAddr1',
  } as ExchangeAssetOption,
  amountRaw: '50000000',
  account: { id: 'acc1', country: 'NG' } as BankAccountSummary,
  fiatTotal: 75000,
  currency: 'NGN',
  rate: 1500,
  acceptHours: 24,
  paymentWindowSeconds: 3600,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockEnsureBalance.mockResolvedValue(undefined)
  mockEscrowCreate.mockResolvedValue({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  mockExchangeCreate.mockResolvedValue({ escrow_id: 'e1' })
  mockEscrowDelete.mockResolvedValue(undefined)
  mockSign.mockResolvedValue('sig-1')
})

test('the wallet gate KEEPS the composition — it no longer navigates away (#60)', async () => {
  mockEscrowCreate.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no wallet on this chain', 'WALLET_REQUIRED'),
  )
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.wallet_required)
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
  expect(mockRefreshMe).toHaveBeenCalledTimes(1)
  // Nothing reached the server, so there is no draft to land on either.
  expect(mockExchangeCreate).not.toHaveBeenCalled()
  expect(result.current.submitting).toBe(false)
})

test('the CONTACT gate still routes — it is not a precondition this surface states', async () => {
  mockEscrowCreate.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no verified contact', 'CONTACT_REQUIRED'),
  )
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.contact_required)
  expect(mockPush).toHaveBeenCalledWith('/settings/security')
  expect(mockRefreshMe).not.toHaveBeenCalled()
})

test('a signed offer is unaffected: it lands on the new offer page', async () => {
  // The positive case, so the two above cannot pass by the hook simply never
  // getting anywhere.
  const { result } = renderHook(() => useOfferSell())
  await act(async () => { await result.current.submit(ARGS) })

  expect(mockExchangeCreate).toHaveBeenCalled()
  expect(mockSign).toHaveBeenCalled()
  expect(mockReplace).toHaveBeenCalledWith('/exchange/e1')
  expect(mockRefreshMe).not.toHaveBeenCalled()
})
