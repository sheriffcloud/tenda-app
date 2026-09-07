/**
 * useEscrowActions — the balance pre-flight on value-moving transitions.
 * Verifies WHICH actions declare a debit (publish funds the escrow, dispute
 * posts the bond; nothing else takes the user's money — checked against both
 * the EVM and Anchor programs), that a short balance stops the flow BEFORE the
 * server round-trip and the wallet, and that the check reads the escrow's own
 * asset. Native/UI deps are stubbed, same strategy as the gate/phase tests.
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
  resolveSignersForChain: (...a: unknown[]) => mockResolveSigners(...a),
}))
const mockResolveSigners = jest.fn()

const mockEnsure = jest.fn()
jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: (...a: unknown[]) => mockEnsure(...a),
}))

const mockBuildPermitFor = jest.fn()
jest.mock('@/wallet/permit', () => ({ buildPermitFor: (...a: unknown[]) => mockBuildPermitFor(...a) }))

const mockRequestBuildCreate = jest.fn()
const mockRequestDispute = jest.fn()
const mockRequestAccept = jest.fn()
const mockRequestApprove = jest.fn()
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: () => ({
    requestBuildCreate: mockRequestBuildCreate,
    requestDispute: mockRequestDispute,
    requestAccept: mockRequestAccept,
    requestApprove: mockRequestApprove,
  }),
}))

jest.mock('@/api/client', () => ({
  api: {},
  ApiClientError: jest.requireActual('@tenda/shared').ApiClientError,
}))

import { useEscrowActions } from '@/hooks/useEscrowActions'

const ARGS = { escrowId: 'e1', chainId: 'eip155:84532', asset: 'USDC_BASE', amountRaw: '10000000' }
const UNSIGNED = { kind: 'evm-tx' as const, to: '0x1', data: '0x', value: '0' }
const SIGNERS = ['0xabc', '0xsecond']

/** The typed failure the sufficiency module raises; the hook must surface it. */
class InsufficientBalanceError extends Error {
  constructor() {
    super('You need 10 USDC but your wallet holds 2.5 USDC.')
    this.name = 'InsufficientBalanceError'
  }
}

beforeEach(() => {
  mockShowToast.mockReset()
  mockSignSendAndReport.mockReset().mockResolvedValue('sig')
  mockEnsure.mockReset().mockResolvedValue(undefined)
  mockResolveSigners.mockReset().mockReturnValue(SIGNERS)
  mockBuildPermitFor.mockReset()
  mockRequestBuildCreate.mockReset().mockResolvedValue(UNSIGNED)
  mockRequestDispute.mockReset().mockResolvedValue(UNSIGNED)
  mockRequestAccept.mockReset().mockResolvedValue(UNSIGNED)
  mockRequestApprove.mockReset().mockResolvedValue(UNSIGNED)
  mockSettleSignerFor.mockReset().mockResolvedValue(undefined)
  mockDeclaredSignerFor.mockReset().mockReturnValue('DECLARED')
})

// --- publish (funds the escrow) --------------------------------------------

test('publish checks the escrow amount against every candidate wallet', async () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.publish() })

  expect(mockEnsure).toHaveBeenCalledWith({
    chainId: 'eip155:84532',
    assetId: 'USDC_BASE',
    amountRaw: '10000000',
    owners: SIGNERS,
  })
})

test('publish: a short balance stops before the build-tx call and the wallet', async () => {
  mockEnsure.mockRejectedValue(new InsufficientBalanceError())
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => { ok = await result.current.publish() })

  expect(ok).toBe(false)
  expect(mockRequestBuildCreate).not.toHaveBeenCalled()
  expect(mockSignSendAndReport).not.toHaveBeenCalled()
  // The shortfall reaches the user rather than a generic failure.
  expect(mockShowToast).toHaveBeenCalledWith('error', 'You need 10 USDC but your wallet holds 2.5 USDC.')
  expect(result.current.phase).toBe('idle') // no stuck spinner
})

test('publish proceeds when the balance covers it', async () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.publish() })

  // The publish build carries the SIGNER DECLARATION — omit it and the server
  // bakes the primary while the user signs with the connected wallet.
  expect(mockRequestBuildCreate).toHaveBeenCalledWith('e1', 'DECLARED')
  expect(mockSignSendAndReport).toHaveBeenCalled()
})

test('accept declares its signer too — a public accept has a FREE one', async () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.accept() })

  expect(mockRequestAccept).toHaveBeenCalledWith('e1', 'DECLARED')
})

test('the signer is settled BEFORE it is declared on every free build', async () => {
  // Reading the slot first would name the primary and then sign with whatever
  // wallet the user connects a moment later — the mismatch this exists to stop.
  const order: string[] = []
  mockSettleSignerFor.mockImplementation(() => { order.push('settle'); return Promise.resolve() })
  mockDeclaredSignerFor.mockImplementation(() => { order.push('declare'); return 'DECLARED' })
  mockRequestAccept.mockImplementation(() => { order.push('build'); return Promise.resolve(UNSIGNED) })

  const { result } = renderHook(() => useEscrowActions(ARGS))
  await act(async () => { await result.current.accept() })

  expect(order).toEqual(['settle', 'declare', 'build'])
})

test('a chain with no resolvable signer declares nothing rather than guessing', async () => {
  mockDeclaredSignerFor.mockReturnValue(undefined)
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.accept() })

  expect(mockRequestAccept).toHaveBeenCalledWith('e1', undefined)
})

// --- dispute (posts the bond) ----------------------------------------------

test('dispute checks the BOND, not the escrow amount, in the escrow’s asset', async () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.dispute('bad work', '500000') })

  expect(mockEnsure).toHaveBeenCalledWith({
    chainId: 'eip155:84532',
    assetId: 'USDC_BASE', // the bond rides the escrow's asset
    amountRaw: '500000',
    owners: SIGNERS,
  })
})

test('dispute: a short balance stops before the permit signature', async () => {
  mockEnsure.mockRejectedValue(new InsufficientBalanceError())
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => { ok = await result.current.dispute('bad work', '500000') })

  expect(ok).toBe(false)
  expect(mockBuildPermitFor).not.toHaveBeenCalled()
  expect(mockRequestDispute).not.toHaveBeenCalled()
  expect(mockSignSendAndReport).not.toHaveBeenCalled()
})

// --- actions that move no money --------------------------------------------

test('accept never reads a balance (it moves nothing from the user)', async () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.accept() })

  expect(mockEnsure).not.toHaveBeenCalled()
  expect(mockSignSendAndReport).toHaveBeenCalled()
})

test('approve never reads a balance', async () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.approve() })

  expect(mockEnsure).not.toHaveBeenCalled()
})

// --- fail-open reaches the flow --------------------------------------------

test('an unreadable balance does not block publish (fail-open reaches the flow)', async () => {
  // ensureSufficientBalance resolves on every unknown; the flow must continue.
  mockEnsure.mockResolvedValue(undefined)
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = false
  await act(async () => { ok = await result.current.publish() })

  expect(ok).toBe(true)
  expect(mockSignSendAndReport).toHaveBeenCalled()
})
