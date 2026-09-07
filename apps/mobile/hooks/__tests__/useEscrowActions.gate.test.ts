/**
 * useEscrowActions, Stage-9D gate wiring on the shared dispatch path. A
 * transition whose server build-tx call returns WALLET_REQUIRED /
 * CONTACT_REQUIRED routes the user to the fix screen instead of a dead-end
 * toast; an unrelated failure still shows the generic toast and never
 * navigates. Native/UI deps are stubbed.
 */
import { renderHook, act } from '@testing-library/react-native'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }))

const mockSignSendAndReport = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  signSendAndReport: (...a: unknown[]) => mockSignSendAndReport(...a),
  resolveSignersForChain: () => ['SIGNER'],
}))

// The balance pre-flight reaches the chain-registry store and the RPC readers;
// stub it like dispatch. These tests never exercise a value-moving action.
jest.mock('@/wallet/balances', () => ({ ensureSufficientBalance: jest.fn() }))

// The permit helper's import chain reaches the Reown/AppKit native ESM,
// stub it like dispatch (the gate tests never exercise the permit path).
jest.mock('@/wallet/permit', () => ({ buildPermitFor: jest.fn() }))

const mockRequestAccept = jest.fn()
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: () => ({ requestAccept: mockRequestAccept }),
}))

jest.mock('@/api/client', () => {
  class ApiClientError extends Error {
    statusCode: number
    code?: string
    constructor(statusCode: number, error: string, message: string, code?: string) {
      super(message)
      this.statusCode = statusCode
      this.code = code
    }
  }
  return { api: {}, ApiClientError }
})

import { useEscrowActions } from '@/hooks/useEscrowActions'
import { ApiClientError } from '@/api/client'
import { TRANSACTION_GATE_MESSAGE } from '@/lib/transaction-gate'

const ARGS = { escrowId: 'e1', chainId: 'solana:devnet', asset: 'USDC_SOL', amountRaw: '1000000' }

beforeEach(() => {
  mockPush.mockReset(); mockShowToast.mockReset()
  mockSignSendAndReport.mockReset(); mockRequestAccept.mockReset()
})

test('accept: WALLET_REQUIRED routes to linked-wallets, does not sign', async () => {
  mockRequestAccept.mockRejectedValue(new ApiClientError(403, 'Forbidden', 'no wallet', 'WALLET_REQUIRED'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => { ok = await result.current.accept() })

  expect(ok).toBe(false)
  expect(mockShowToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.wallet_required)
  expect(mockPush).toHaveBeenCalledWith('/settings/linked-wallets')
  expect(mockSignSendAndReport).not.toHaveBeenCalled() // gate hit before signing
})

test('accept: CONTACT_REQUIRED routes to the verify-contact screen', async () => {
  mockRequestAccept.mockRejectedValue(new ApiClientError(403, 'Forbidden', 'no contact', 'CONTACT_REQUIRED'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.accept() })

  expect(mockShowToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.contact_required)
  expect(mockPush).toHaveBeenCalledWith('/settings/security')
})

test('accept: an unrelated failure shows the generic toast and never navigates', async () => {
  mockRequestAccept.mockRejectedValue(new ApiClientError(409, 'Conflict', 'wrong status', 'ESCROW_WRONG_STATUS'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.accept() })

  expect(mockShowToast).toHaveBeenCalledWith('error', 'wrong status')
  expect(mockPush).not.toHaveBeenCalled()
})
