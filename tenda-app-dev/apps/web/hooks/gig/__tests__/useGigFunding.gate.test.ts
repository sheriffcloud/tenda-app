/**
 * The 9D first-transaction gate, on the funding path (web).
 *
 * Split from useGigFunding.test.ts, which was AT the 300-line limit: this file
 * owns what happens when the SERVER refuses, and #59 changed that answer for
 * the wallet half — it must no longer navigate away from a filled composer.
 * The classifier is the REAL shared one; these tests throw real error codes.
 */
import { act, renderHook, type RenderHookResult } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiClientError, TRANSACTION_GATE_MESSAGE, type GigFormValues } from '@tenda/shared'

const { mockPush, mockReplace, mockToast, mockSign, mockResolveSigners, mockEnsure, mockPreconditions, mockBuildPermitFor, mockDeclaredSigner, mockEscrowCreate, mockEscrowDelete, mockGigCreate, mockRefreshWallets } = vi.hoisted(() => ({
  mockRefreshWallets: vi.fn(async () => {}),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockToast: vi.fn(),
  mockSign: vi.fn(),
  mockResolveSigners: vi.fn(),
  mockEnsure: vi.fn(),
  mockPreconditions: vi.fn(),
  mockBuildPermitFor: vi.fn(),
  mockDeclaredSigner: vi.fn(),
  mockEscrowCreate: vi.fn(),
  mockEscrowDelete: vi.fn(),
  mockGigCreate: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))
// The wallet gate refreshes wallets[] instead of navigating (#59), so the
// store is a real dependency of this hook now.
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ refreshWallets: mockRefreshWallets }) },
}))
vi.mock('@/wallet/dispatch', () => ({
  signSendAndReport: (...a: unknown[]) => mockSign(...a),
  resolveSignersForChain: (...a: unknown[]) => mockResolveSigners(...a),
  ensureTxPreconditions: (...a: unknown[]) => mockPreconditions(...a),
  declaredSignerFor: (...a: unknown[]) => mockDeclaredSigner(...a),
}))
vi.mock('@/wallet/balances', () => ({ ensureSufficientBalance: (...a: unknown[]) => mockEnsure(...a) }))
vi.mock('@/wallet/permit', () => ({ buildPermitFor: (...a: unknown[]) => mockBuildPermitFor(...a) }))
vi.mock('@/api/client', () => ({
  api: {
    escrows: {
      create: (b: unknown) => mockEscrowCreate(b),
      delete: (b: unknown) => mockEscrowDelete(b),
    },
    gigs: { create: (b: unknown) => mockGigCreate(b) },
  },
}))

import { useGigFunding } from '@/hooks/gig/useGigFunding'

const SIGNERS = ['SoLSigner', 'SoLSecond']
const VALUES: GigFormValues = {
  title: 'Fix my sink',
  description: 'leaky',
  chainId: 'solana:devnet',
  asset: 'USDC_SOL',
  paymentRaw: '10000000',
  completionDuration: 86_400,
  acceptDeadlineHours: 24,
  category: 'service',
  country: 'NG',
  remote: true,
  city: null,
  proofRequirements: [],
  latitude: null, longitude: null, proofParams: null,
  requiresApproval: false,
}

type HookResult = RenderHookResult<ReturnType<typeof useGigFunding>, unknown>['result']

/** Drive the hook from confirm → funding, the screen's real sequence. */
async function fund(result: HookResult, values: GigFormValues = VALUES) {
  await act(async () => {
    result.current.setPendingValues(values)
  })
  await act(async () => {
    await result.current.runFunding()
  })
}

beforeEach(() => {
  mockSign.mockResolvedValue('sig-1')
  mockResolveSigners.mockReturnValue(SIGNERS)
  mockEnsure.mockResolvedValue(undefined)
  mockBuildPermitFor.mockResolvedValue(undefined)
  mockEscrowCreate.mockResolvedValue({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  mockEscrowDelete.mockResolvedValue(undefined)
  mockGigCreate.mockResolvedValue({})
})

const ARGS = { resetForm: vi.fn() }

test('the wallet gate KEEPS the composer — it no longer navigates away (#59)', async () => {
  // This is the whole of #59's second half. Routing to Settings here unmounted
  // the composer and took every field with it: the category, the brief, the
  // budget, the proof params. The reader came back to a blank form having done
  // nothing wrong. The notice above the wizard is the way out instead, and
  // refreshing wallets[] is what makes it appear — the server has just
  // contradicted this client, so the list it believed is the stale thing.
  mockEscrowCreate.mockRejectedValue(
    new ApiClientError(403, 'Forbidden', 'no wallet on this chain', 'WALLET_REQUIRED'),
  )
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockToast).toHaveBeenCalledWith('error', TRANSACTION_GATE_MESSAGE.wallet_required)
  expect(mockPush).not.toHaveBeenCalled()
  expect(mockReplace).not.toHaveBeenCalled()
  expect(mockRefreshWallets).toHaveBeenCalledTimes(1)
  // And the composer is not blanked either: resetForm is what clears the
  // fields, and nothing here has been committed to the server to clear them for.
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

