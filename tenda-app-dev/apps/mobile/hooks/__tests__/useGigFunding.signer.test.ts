/**
 * useGigFunding, the SIGNER DECLARATION only — split from useGigFunding.test.ts
 * because that file is already at the size limit.
 *
 * What the create bakes is the wallet that must sign forever after, so this
 * covers three things: that the declaration is sent, that the session is
 * settled BEFORE it is read (on EVM the slot is empty until it is, so reading
 * first would name the primary and then sign with someone else), and that a
 * chain with nothing resolvable declares nothing at all rather than guessing.
 */
import { renderHook } from '@testing-library/react-native'
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, setParams: mockSetParams }),
}))
const mockToast = jest.fn()
jest.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
const mockSign = jest.fn()
const mockResolveSigners = jest.fn()
const mockSettleSignerFor: jest.Mock<Promise<void>, [string]> = jest.fn()
const mockDeclaredSignerFor: jest.Mock<string | undefined, [string]> = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  // The signer declaration: settled (a no-op off EVM) then read.
  settleSignerFor: (chainId: string) => mockSettleSignerFor(chainId),
  declaredSignerFor: (chainId: string) => mockDeclaredSignerFor(chainId),
  signSendAndReport: (...a: unknown[]) => mockSign(...a),
  resolveSignersForChain: (...a: unknown[]) => mockResolveSigners(...a),
}))
const mockEnsure = jest.fn()
jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: (...a: unknown[]) => mockEnsure(...a),
}))
const mockBuildPermitFor = jest.fn()
jest.mock('@/wallet/permit', () => ({ buildPermitFor: (...a: unknown[]) => mockBuildPermitFor(...a) }))
const mockEscrowCreate = jest.fn()
const mockEscrowDelete = jest.fn()
const mockGigCreate = jest.fn()
jest.mock('@/api/client', () => ({
  api: {
    escrows: {
      create: (b: unknown) => mockEscrowCreate(b),
      delete: (b: unknown) => mockEscrowDelete(b),
    },
    gigs: { create: (b: unknown) => mockGigCreate(b) },
  },
  // The REAL shared class — sources narrow `instanceof ApiClientError` against it.
  ApiClientError: jest.requireActual('@tenda/shared').ApiClientError,
}))
// Imports stay below mock declarations so their modules observe the test doubles.
// The 9D gate is NOT mocked since its move to @tenda/shared: the tests throw
// the real ApiClientError codes and the hook runs the real classifier.
// eslint-disable-next-line import/first
import { useGigFunding } from '@/hooks/useGigFunding'
// eslint-disable-next-line import/first
import {
  FUNDING_SIGNERS as SIGNERS,
  fundWith as fund,
} from '@/hooks/__fixtures__/gig-funding'
beforeEach(() => {
  mockPush.mockReset(); mockNavigate.mockReset(); mockSetParams.mockReset()
  mockToast.mockReset()
  mockSign.mockReset().mockResolvedValue('sig-1')
  mockResolveSigners.mockReset().mockReturnValue(SIGNERS)
  mockEnsure.mockReset().mockResolvedValue(undefined)
  mockBuildPermitFor.mockReset().mockResolvedValue(undefined)
  mockEscrowCreate.mockReset().mockResolvedValue({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  mockEscrowDelete.mockReset().mockResolvedValue(undefined)
  mockGigCreate.mockReset().mockResolvedValue({})
  mockSettleSignerFor.mockReset().mockResolvedValue(undefined)
  mockDeclaredSignerFor.mockReset().mockReturnValue('DECLARED')
})
const ARGS = { resetForm: jest.fn() }

test('the create body carries the declared signer', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)

  expect(mockEscrowCreate).toHaveBeenCalledWith(
    expect.objectContaining({ signer_address: 'DECLARED' }),
  )
})

test('the signer is settled before it is read, and read before the create', async () => {
  const order: string[] = []
  mockSettleSignerFor.mockImplementation(() => { order.push('settle'); return Promise.resolve() })
  mockDeclaredSignerFor.mockImplementation(() => { order.push('declare'); return 'DECLARED' })
  mockEscrowCreate.mockImplementation(() => {
    order.push('create')
    return Promise.resolve({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  })

  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)

  expect(order).toEqual(['settle', 'declare', 'create'])
})

test('the permit is signed BEFORE the declaration is settled — same account, one prompt', async () => {
  // buildPermitFor connects and resolves the owner itself; settling after it
  // keeps the declared signer identical to the permit's owner, which the
  // contract requires. Settling first would be harmless but re-orders the
  // wallet prompts, so the order is asserted rather than assumed.
  const order: string[] = []
  mockBuildPermitFor.mockImplementation(() => { order.push('permit'); return Promise.resolve(undefined) })
  mockSettleSignerFor.mockImplementation(() => { order.push('settle'); return Promise.resolve() })

  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)

  expect(order).toEqual(['permit', 'settle'])
})

test('nothing resolvable means NO signer_address key, not an undefined one', async () => {
  // Absent = "use the primary", the behaviour that existed before the field.
  mockDeclaredSignerFor.mockReturnValue(undefined)

  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)

  const [body] = mockEscrowCreate.mock.calls[0]
  expect('signer_address' in (body as Record<string, unknown>)).toBe(false)
})
