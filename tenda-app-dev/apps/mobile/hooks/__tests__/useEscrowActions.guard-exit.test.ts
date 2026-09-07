/**
 * useEscrowActions — guard exits from the signing phase. When the WC request
 * guard cancels (user tapped Cancel) or times out (lost relay response), the
 * dispatch must land back on idle with an INFO toast (an expected path, the tx
 * may still sync server-side), not the generic error surface. Same stub
 * strategy as the balance tests.
 */
import { renderHook, act } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }))

const mockSignSendAndReport = jest.fn()
const mockSettleSignerFor: jest.Mock<Promise<void>, [string]> = jest.fn()
const mockDeclaredSignerFor: jest.Mock<string | undefined, [string]> = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  // The signer declaration: settled (a no-op off EVM) then read.
  settleSignerFor: (chainId: string) => mockSettleSignerFor(chainId),
  declaredSignerFor: (chainId: string) => mockDeclaredSignerFor(chainId),
  signSendAndReport: (...a: unknown[]) => mockSignSendAndReport(...a),
  resolveSignersForChain: () => ['0xabc'],
}))

jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/wallet/permit', () => ({ buildPermitFor: jest.fn() }))

const mockRequestAccept = jest.fn()
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: () => ({ requestAccept: mockRequestAccept }),
}))

jest.mock('@/api/client', () => ({
  api: {},
  ApiClientError: jest.requireActual('@tenda/shared').ApiClientError,
}))

import { useEscrowActions } from '@/hooks/useEscrowActions'
import { WalletError } from '@tenda/shared'

const ARGS = { escrowId: 'e1', chainId: 'eip155:84532', asset: 'USDC_BASE', amountRaw: '10000000' }
const UNSIGNED = { kind: 'evm-tx' as const, to: '0x1', data: '0x', value: '0' }

beforeEach(() => {
  mockShowToast.mockReset()
  mockSignSendAndReport.mockReset()
  mockRequestAccept.mockReset().mockResolvedValue(UNSIGNED)
})

test('a guard timeout lands on idle with an info toast, never an error', async () => {
  mockSignSendAndReport.mockRejectedValue(
    new WalletError('timeout', 'Your wallet did not respond.'),
  )
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => {
    ok = await result.current.accept()
  })

  expect(ok).toBe(false)
  expect(result.current.phase).toBe('idle')
  expect(result.current.pendingTxRef).toBeNull()
  expect(mockShowToast).toHaveBeenCalledWith('info', 'Your wallet did not respond.')
})

test('a user cancel (guard decline) lands on idle with an info toast', async () => {
  mockSignSendAndReport.mockRejectedValue(new WalletError('declined', 'Transaction cancelled.'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => {
    ok = await result.current.accept()
  })

  expect(ok).toBe(false)
  expect(result.current.phase).toBe('idle')
  expect(mockShowToast).toHaveBeenCalledWith('info', 'Transaction cancelled.')
})

test('a genuine failure still surfaces as an error toast', async () => {
  mockSignSendAndReport.mockRejectedValue(new Error('execution reverted'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => {
    await result.current.accept()
  })

  expect(result.current.phase).toBe('idle')
  expect(mockShowToast).toHaveBeenCalledWith('error', 'execution reverted')
})

test('a successful dispatch still reaches confirming with the tx ref', async () => {
  mockSignSendAndReport.mockResolvedValue('0xhash')
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = false
  await act(async () => {
    ok = await result.current.accept()
  })

  expect(ok).toBe(true)
  expect(result.current.phase).toBe('confirming')
  expect(result.current.pendingTxRef).toBe('0xhash')
})
