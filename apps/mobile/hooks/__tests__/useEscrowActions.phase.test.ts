/**
 * useEscrowActions phase machine — drives the progress modal. Verifies the
 * lifecycle steps through preparing → signing → broadcasting → confirming, that
 * activeAction/pendingTxRef land, that clearPending resets, and that failures
 * (build reject, proof-upload reject) fall back to idle without a stuck spinner.
 * Native/UI deps are stubbed, same strategy as the gate test.
 */
import { renderHook, act } from '@testing-library/react-native'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }))

const mockSignSendAndReport = jest.fn()
jest.mock('@/wallet/dispatch', () => ({
  signSendAndReport: (...a: unknown[]) => mockSignSendAndReport(...a),
  resolveSignersForChain: () => ['SIGNER'],
}))

// The balance pre-flight reaches the chain-registry store and the RPC readers;
// stub it like dispatch. Sufficiency itself is covered in wallet/balances.
const mockEnsureSufficientBalance = jest.fn()
jest.mock('@/wallet/balances', () => ({
  ensureSufficientBalance: (...a: unknown[]) => mockEnsureSufficientBalance(...a),
}))
const mockBuildPermitFor = jest.fn()
jest.mock('@/wallet/permit', () => ({ buildPermitFor: (...a: unknown[]) => mockBuildPermitFor(...a) }))

const mockRequestApprove = jest.fn()
const mockRequestSubmit = jest.fn()
const mockRequestDispute = jest.fn()
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: () => ({
    requestApprove: mockRequestApprove,
    requestSubmit: mockRequestSubmit,
    requestDispute: mockRequestDispute,
  }),
}))

const mockAddProofs = jest.fn()
jest.mock('@/api/client', () => {
  class ApiClientError extends Error {
    code?: string
    constructor(message: string, code?: string) {
      super(message)
      this.code = code
    }
  }
  return { api: { escrows: { addProofs: (...a: unknown[]) => mockAddProofs(...a) } }, ApiClientError }
})

import { useEscrowActions } from '@/hooks/useEscrowActions'

const ARGS = { escrowId: 'e1', chainId: 'solana:devnet', asset: 'USDC_SOL', amountRaw: '2500000' }
const UNSIGNED = { kind: 'solana-tx', tx_base64: 'AA==' }

beforeEach(() => {
  mockShowToast.mockReset()
  mockSignSendAndReport.mockReset()
  mockRequestApprove.mockReset()
  mockRequestSubmit.mockReset()
  mockRequestDispute.mockReset()
  mockAddProofs.mockReset()
  mockBuildPermitFor.mockReset()
})

test('starts idle', () => {
  const { result } = renderHook(() => useEscrowActions(ARGS))
  expect(result.current.phase).toBe('idle')
  expect(result.current.activeAction).toBeNull()
})

test('a successful transition ends in confirming with the txRef + action, then clears', async () => {
  mockRequestApprove.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig-1')
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = false
  await act(async () => { ok = await result.current.approve() })

  expect(ok).toBe(true)
  expect(result.current.phase).toBe('confirming')
  expect(result.current.pendingTxRef).toBe('sig-1')
  expect(result.current.activeAction).toBe('approve')

  act(() => result.current.clearPending())
  expect(result.current.phase).toBe('idle')
  expect(result.current.pendingTxRef).toBeNull()
  expect(result.current.activeAction).toBeNull()
})

test('sits in the signing phase while the wallet is open (before broadcast)', async () => {
  mockRequestApprove.mockResolvedValue(UNSIGNED)
  let resolveSign: (v: string) => void = () => {}
  mockSignSendAndReport.mockReturnValue(new Promise<string>((r) => { resolveSign = r }))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let pending: Promise<boolean> = Promise.resolve(false)
  await act(async () => {
    pending = result.current.approve()
    // Flush requestApprove so signSendAndReport is reached but left pending.
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(result.current.phase).toBe('signing')

  await act(async () => {
    resolveSign('sig-1')
    await pending
  })
  expect(result.current.phase).toBe('confirming')
})

test('moves to broadcasting after Solana signing and before an RPC result exists', async () => {
  mockRequestApprove.mockResolvedValue(UNSIGNED)
  let resolveBroadcast: (value: string) => void = () => {}
  mockSignSendAndReport.mockImplementation((args: { onSigned?: () => void }) => {
    args.onSigned?.()
    return new Promise<string>((resolve) => { resolveBroadcast = resolve })
  })
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let pending: Promise<boolean> = Promise.resolve(false)
  await act(async () => {
    pending = result.current.approve()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(result.current.phase).toBe('broadcasting')

  await act(async () => { resolveBroadcast('sig-1'); await pending })
  expect(result.current.phase).toBe('confirming')
})

test('a build failure returns to idle and never signs', async () => {
  mockRequestApprove.mockRejectedValue(new Error('boom'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => { ok = await result.current.approve() })

  expect(ok).toBe(false)
  expect(result.current.phase).toBe('idle')
  expect(result.current.pendingTxRef).toBeNull()
  expect(mockSignSendAndReport).not.toHaveBeenCalled()
  expect(mockShowToast).toHaveBeenCalledWith('error', 'boom')
})

test('submit: a proof-upload failure aborts before the chain and resets phase', async () => {
  mockAddProofs.mockRejectedValue(new Error('upload failed'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => { ok = await result.current.submit([{ url: 'u1', type: 'image' }]) })

  expect(ok).toBe(false)
  expect(result.current.phase).toBe('idle')
  expect(mockRequestSubmit).not.toHaveBeenCalled()
  expect(mockShowToast).toHaveBeenCalledWith('error', 'upload failed')
})

test('submit: uploads proofs then commits the digest on-chain (→ confirming)', async () => {
  mockAddProofs.mockResolvedValue(undefined)
  mockRequestSubmit.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig-2')
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = false
  await act(async () => { ok = await result.current.submit([{ url: 'u1', type: 'image' }]) })

  expect(ok).toBe(true)
  expect(mockAddProofs).toHaveBeenCalledWith({ id: 'e1' }, { proofs: [{ url: 'u1', type: 'image' }] })
  expect(mockRequestSubmit).toHaveBeenCalled()
  expect(result.current.phase).toBe('confirming')
  expect(result.current.activeAction).toBe('submit')
})

test('dispute: a zero bond skips the permit and still confirms', async () => {
  mockRequestDispute.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig-d')
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.dispute('bad work', '0') })

  expect(mockBuildPermitFor).not.toHaveBeenCalled()
  expect(mockRequestDispute).toHaveBeenCalledWith('e1', '0', 'bad work', undefined)
  expect(result.current.phase).toBe('confirming')
})

test('dispute: a non-zero ERC-20 bond builds the permit first', async () => {
  mockBuildPermitFor.mockResolvedValue({ signature: '0xpermit' })
  mockRequestDispute.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig-d2')
  const { result } = renderHook(() => useEscrowActions(ARGS))

  await act(async () => { await result.current.dispute('bad work', '5000000') })

  // The bond rides the escrow's own asset (both contracts collect it in
  // `escrow.asset`), which the hook now owns rather than taking per call.
  expect(mockBuildPermitFor).toHaveBeenCalledWith({
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    value_raw: '5000000',
  })
  expect(mockRequestDispute).toHaveBeenCalledWith('e1', '5000000', 'bad work', { signature: '0xpermit' })
})

test('addProofs (supplementary, off-chain) toasts success and never signs', async () => {
  mockAddProofs.mockResolvedValue(undefined)
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = false
  await act(async () => { ok = await result.current.addProofs([{ url: 'u2', type: 'image' }]) })

  expect(ok).toBe(true)
  expect(mockShowToast).toHaveBeenCalledWith('success', 'Proof added!')
  expect(mockSignSendAndReport).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('idle') // off-chain, no progress modal
})

test('addProofs: a failure toasts and returns false', async () => {
  mockAddProofs.mockRejectedValue(new Error('nope'))
  const { result } = renderHook(() => useEscrowActions(ARGS))

  let ok = true
  await act(async () => { ok = await result.current.addProofs([{ url: 'u2', type: 'image' }]) })

  expect(ok).toBe(false)
  expect(mockShowToast).toHaveBeenCalledWith('error', 'nope')
})
