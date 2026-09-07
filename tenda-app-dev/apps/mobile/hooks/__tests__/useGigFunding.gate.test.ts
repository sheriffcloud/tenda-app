/**
 * The 9D first-transaction gate, on the funding path.
 *
 * Split from useGigFunding.test.ts (which was at the 300-line limit) alongside
 * the existing .signer. sibling: this file owns what happens when the SERVER
 * refuses, and #59 changed that answer for the wallet half.
 */
import { renderHook } from '@testing-library/react-native'
const mockPush = jest.fn()
const mockRefreshMe = jest.fn(async () => {})
// The wallet gate refreshes wallets[] instead of navigating (#59), so the
// store is a real dependency of this hook now.
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ refreshMe: mockRefreshMe }) },
}))
const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, setParams: mockSetParams }),
}))
const mockToast = jest.fn()
jest.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
const mockSign = jest.fn()
const mockResolveSigners = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  // Present so the module loads; the declaration itself is asserted in the
  // sibling useGigFunding.signer.test.ts.
  settleSignerFor: jest.fn(),
  declaredSignerFor: jest.fn(),
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
import { ApiClientError, TRANSACTION_GATE_MESSAGE } from '@tenda/shared'
// eslint-disable-next-line import/first
import { useGigFunding } from '@/hooks/useGigFunding'
// eslint-disable-next-line import/first
import { FUNDING_SIGNERS as SIGNERS, fundWith as fund } from '@/hooks/__fixtures__/gig-funding'
beforeEach(() => {
  mockPush.mockReset(); mockNavigate.mockReset(); mockSetParams.mockReset()
  mockToast.mockReset()
  mockRefreshMe.mockClear()
  ARGS.resetForm.mockClear()
  mockSign.mockReset().mockResolvedValue('sig-1')
  mockResolveSigners.mockReset().mockReturnValue(SIGNERS)
  mockEnsure.mockReset().mockResolvedValue(undefined)
  mockBuildPermitFor.mockReset().mockResolvedValue(undefined)
  mockEscrowCreate.mockReset().mockResolvedValue({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  mockEscrowDelete.mockReset().mockResolvedValue(undefined)
  mockGigCreate.mockReset().mockResolvedValue({})
})

const ARGS = { resetForm: jest.fn() }

test('the wallet gate KEEPS the composer — it no longer navigates away (#59)', async () => {
  // #59's second half, as it applies HERE. The composer is a tab screen that
  // never unmounts (see create-gig.tsx), so the old push did not blank the
  // fields the way web's route change did — it buried them under Settings
  // mid-compose. `resetForm` is the only thing on this client that CAN blank
  // them, which is why it is asserted below: staying put has to mean the
  // fields are still there, not merely that no navigation happened.
  mockEscrowCreate.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no wallet on this chain', 'WALLET_REQUIRED'),
  )
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.wallet_required)
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockRefreshMe).toHaveBeenCalledTimes(1)
  // Nor is the composer blanked: resetForm clears the fields, and nothing has
  // been committed to the server that would justify clearing them.
  expect(ARGS.resetForm).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('idle')
})

test('the contact gate routes to Sign-in & security', async () => {
  mockEscrowCreate.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no verified contact', 'CONTACT_REQUIRED'),
  )
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.contact_required)
  expect(mockPush).toHaveBeenCalledWith('/settings/security')
})
