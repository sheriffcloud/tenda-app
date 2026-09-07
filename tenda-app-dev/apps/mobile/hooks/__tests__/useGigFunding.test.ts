/**
 * useGigFunding — the post-a-gig funding lifecycle, with the balance pre-flight
 * ahead of the permit signature and the draft. The ordering IS the feature: an
 * underfunded creator used to sign a permit, wait, and watch the create revert,
 * leaving a draft to retry. Also covers fail-open and the pre-existing paths
 * (moderation block) surviving the extraction from the screen. The 9D
 * transaction gate has its own sibling, useGigFunding.gate.test.ts.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { GigFormValues } from '@tenda/shared'
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
import { useGigFunding } from '@/hooks/useGigFunding'
// eslint-disable-next-line import/first
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
// eslint-disable-next-line import/first
import {
  FUNDING_SIGNERS as SIGNERS,
  FUNDING_VALUES as VALUES,
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
})
const ARGS = { resetForm: jest.fn() }
test('checks the budget against every candidate wallet before anything else', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockEnsure).toHaveBeenCalledWith({
    chainId: 'solana:devnet',
    assetId: 'USDC_SOL',
    amountRaw: '10000000',
    owners: SIGNERS,
  })
})
test('a short balance costs the user NO permit signature and NO draft', async () => {
  mockEnsure.mockRejectedValue(new Error('You need 10 USDC but your wallet holds 2.5 USDC.'))
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  // The ordering that makes the check worth having.
  expect(mockBuildPermitFor).not.toHaveBeenCalled()
  expect(mockEscrowCreate).not.toHaveBeenCalled()
  expect(mockGigCreate).not.toHaveBeenCalled()
  expect(mockEscrowDelete).not.toHaveBeenCalled() // nothing to clean up
  expect(mockSign).not.toHaveBeenCalled()
  expect(mockToast).toHaveBeenCalledWith('error', 'You need 10 USDC but your wallet holds 2.5 USDC.')
  expect(result.current.phase).toBe('idle') // no stuck spinner, the form is usable
  expect(mockPush).not.toHaveBeenCalled() // stays on the form, budget still editable
})
test('a covered budget funds the gig end to end', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockEscrowCreate).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'gig', chain_id: 'solana:devnet', asset: 'USDC_SOL', amount_raw: '10000000' }),
  )
  expect(mockGigCreate).toHaveBeenCalledWith(expect.objectContaining({ escrow_id: 'e1', title: 'Fix my sink' }))
  expect(mockSign).toHaveBeenCalled()
  expect(result.current.phase).toBe('confirming')
  expect(result.current.monitor).toEqual({ signature: 'sig-1', escrowId: 'e1', chainId: 'solana:devnet' })
})
test('an ambiguous create failure retries with the same operation and deadline', async () => {
  mockEscrowCreate
    .mockRejectedValueOnce(new Error('request timed out'))
    .mockResolvedValueOnce({ escrow_id: 'e1', unsigned: { kind: 'solana-tx' } })
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  await fund(result)
  expect(mockEscrowCreate).toHaveBeenCalledTimes(2)
  const first = mockEscrowCreate.mock.calls[0][0]
  const retry = mockEscrowCreate.mock.calls[1][0]
  expect(retry.creation_operation_id).toBe(first.creation_operation_id)
  expect(retry.accept_deadline_unix).toBe(first.accept_deadline_unix)
  expect(mockGigCreate).toHaveBeenCalledTimes(1)
})
test('an unreadable balance still posts the gig (fail-open)', async () => {
  mockEnsure.mockResolvedValue(undefined)
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockEscrowCreate).toHaveBeenCalled()
  expect(mockSign).toHaveBeenCalled()
})
test('the permit is signed only once the balance clears, for the full budget', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockBuildPermitFor).toHaveBeenCalledWith({
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    value_raw: '10000000',
  })
})
// --- paths that must survive the extraction from the screen -----------------
test('a moderation block surfaces the dialog and discards the orphan draft', async () => {
  const { ApiClientError } = jest.requireActual<typeof import('@tenda/shared')>('@tenda/shared')
  mockGigCreate.mockRejectedValue(
    new ApiClientError(422, 'Unprocessable Entity', 'This gig breaks our rules', 'CONTENT_MODERATED'),
  )
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockEscrowDelete).toHaveBeenCalledWith({ id: 'e1' })
  expect(result.current.blockedMessage).toBe('This gig breaks our rules')
  expect(mockSign).not.toHaveBeenCalled()
  await act(async () => { result.current.dismissBlocked() })
  expect(result.current.blockedMessage).toBeNull()
})
test('signing declined after the draft is saved keeps the draft', async () => {
  mockSign.mockRejectedValue(new Error('user declined'))
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  expect(mockEscrowDelete).not.toHaveBeenCalled()
  expect(mockToast).toHaveBeenCalledWith('info', 'user declined')
  expect(mockPush).toHaveBeenCalledWith('/gig/e1')
})
// ── Composer reset ────────────────────────────────────────────────────────────
//
// Post-a-Gig is a tab screen: it never unmounts, so anything the hook does not
// explicitly blank is still sitting in the form the next time the user opens
// the tab. Both paths below leave the composed values on the SERVER, so the
// screen must not keep a second copy of them.
test('a saved draft blanks the composer, the retry lives on the draft', async () => {
  mockSign.mockRejectedValue(new Error('user declined'))
  const resetForm = jest.fn()
  const { result } = renderHook(() => useGigFunding({ resetForm }))
  await fund(result)
  expect(resetForm).toHaveBeenCalled()
})
test('a funded gig blanks the composer even when it was not a draft repost', async () => {
  const resetForm = jest.fn()
  const { result } = renderHook(() => useGigFunding({ resetForm }))
  await fund(result)
  await act(async () => { result.current.handleFunded() })
  expect(resetForm).toHaveBeenCalled()
  // No draftId to clear — clearing it anyway would remount the form a second
  // time for nothing.
  expect(mockSetParams).not.toHaveBeenCalled()
})
test('a moderation block leaves the composer intact so the user can edit', async () => {
  const { ApiClientError } = jest.requireActual<typeof import('@tenda/shared')>('@tenda/shared')
  mockGigCreate.mockRejectedValue(
    new ApiClientError(422, 'Unprocessable Entity', 'This gig breaks our rules', 'CONTENT_MODERATED'),
  )
  const resetForm = jest.fn()
  const { result } = renderHook(() => useGigFunding({ resetForm }))
  await fund(result)
  // Nothing was committed — the dialog's "Edit" is worthless against a blank form.
  expect(resetForm).not.toHaveBeenCalled()
})
test('a failed pre-flight leaves the composer intact', async () => {
  mockEnsure.mockRejectedValue(new Error('You need 10 USDC but your wallet holds 2.5 USDC.'))
  const resetForm = jest.fn()
  const { result } = renderHook(() => useGigFunding({ resetForm }))
  await fund(result)
  expect(resetForm).not.toHaveBeenCalled()
})
test('reposting a draft discards the abandoned one once the new draft exists', async () => {
  const { result } = renderHook(() =>
    useGigFunding({ draftId: 'old-draft', resetForm: jest.fn() }),
  )
  await fund(result)
  expect(mockEscrowDelete).toHaveBeenCalledWith({ id: 'old-draft' })
})
test('a confirmed escrow clears the draft prefill and lands on the gig', async () => {
  const resetForm = jest.fn()
  const { result } = renderHook(() => useGigFunding({ draftId: 'old-draft', resetForm }))
  await fund(result)
  await act(async () => { result.current.handleFunded() })
  expect(resetForm).toHaveBeenCalled()
  expect(mockSetParams).toHaveBeenCalledWith({ draftId: '' })
  expect(mockToast).toHaveBeenCalledWith('success', 'Gig funded and live!')
  expect(mockPush).toHaveBeenCalledWith('/gig/e1')
  expect(result.current.phase).toBe('idle')
})
test('funding a gig records the commitment that earns the notification re-ask', async () => {
  // Without this the tier-2 trigger could be deleted and no test would fail.
  useNotificationPromptStore.setState({ commitmentCount: 0 })
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  await act(async () => { result.current.handleFunded() })
  await waitFor(() => {
    expect(useNotificationPromptStore.getState().commitmentCount).toBe(1)
  })
})
test('a timeout still lands the user on the gig rather than trapping the modal', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result)
  await act(async () => { result.current.handleFundTimeout('') })
  expect(mockToast).toHaveBeenCalledWith('info', 'Submitted — it will go live once the escrow confirms.')
  expect(mockPush).toHaveBeenCalledWith('/gig/e1')
})
test('runFunding without confirmed values is a no-op', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await act(async () => { await result.current.runFunding() })
  expect(mockEnsure).not.toHaveBeenCalled()
  expect(mockEscrowCreate).not.toHaveBeenCalled()
})
// ── Acceptance mode ───────────────────────────────────────────────────────────
/**
 * The mode picker's ENTIRE purpose is to reach the escrow row: it is baked
 * on-chain at create and can never be changed afterwards. If it stopped being
 * forwarded, every gig would silently post as first-come and the applications
 * surface would be unreachable — with nothing failing anywhere.
 */
test('approval mode is forwarded to the create body', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result, { ...VALUES, requiresApproval: true })
  expect(mockEscrowCreate).toHaveBeenCalledWith(
    expect.objectContaining({ requires_approval: true }),
  )
})
test('instant mode sends no flag at all, rather than an explicit false', async () => {
  const { result } = renderHook(() => useGigFunding(ARGS))
  await fund(result, { ...VALUES, requiresApproval: false })
  const [body] = mockEscrowCreate.mock.calls[0]
  // The server treats an absent flag as instant, so omitting it and sending
  // `false` mean the same thing — and the smaller body is the honest one.
  expect(body).not.toHaveProperty('requires_approval')
})
