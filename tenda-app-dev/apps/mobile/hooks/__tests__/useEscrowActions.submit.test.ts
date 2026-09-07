/**
 * The two legs of `submit`, and the retry the second leg exists to make
 * possible.
 *
 * A proof submit is upload-then-sign. When the SIGN half fails — a declined
 * wallet, a dropped connection — the upload half has already succeeded, and
 * the worker used to have to do it again because the digest was taken over the
 * batch they handed in. It is taken over the escrow's whole stored set now,
 * read back from the server, so an empty batch is a legitimate retry rather
 * than nothing to submit.
 *
 * The phase suite covers the happy path and the phase machine; this one covers
 * what the two legs do when they are NOT symmetric.
 */
import { renderHook, act } from '@testing-library/react-native'
import { PROOF_COPY } from '@tenda/shared'

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
  resolveSignersForChain: () => ['SIGNER'],
}))
jest.mock('@/wallet/balances', () => ({ ensureSufficientBalance: jest.fn() }))
jest.mock('@/wallet/permit', () => ({ buildPermitFor: jest.fn() }))

const mockRequestSubmit = jest.fn()
jest.mock('@/stores/escrow.store', () => ({
  useEscrowStore: () => ({ requestSubmit: mockRequestSubmit }),
}))

const mockAddProofs = jest.fn()
const mockGetProofs = jest.fn()
jest.mock('@/api/client', () => {
  const { ApiClientError } = jest.requireActual('@tenda/shared')
  return {
    api: {
      escrows: {
        addProofs: (...a: unknown[]) => mockAddProofs(...a),
        proofs: (...a: unknown[]) => mockGetProofs(...a),
      },
    },
    ApiClientError,
  }
})

import { useEscrowActions } from '@/hooks/useEscrowActions'
import { proofHashFor } from '@/hooks/escrow/proof-hash'

const ARGS = { escrowId: 'e1', chainId: 'solana:devnet', asset: 'USDC_SOL', amountRaw: '2500000' }
const UNSIGNED = { chain_id: 'solana:devnet', payload: 'base64tx' }

/** Drive `submit` and hand back both the verdict and the hook. */
async function submit(proofs: { url: string; type: 'image' }[]) {
  const { result } = renderHook(() => useEscrowActions(ARGS))
  let ok = false
  await act(async () => { ok = await result.current.submit(proofs) })
  return { ok, result }
}

test('an EMPTY batch is a retry, not a no-op: it signs without re-uploading', async () => {
  // The situation: the files went up, the transaction did not. There is
  // nothing left to upload and everything left to sign.
  mockGetProofs.mockResolvedValue([{ url: 'u1' }, { url: 'u2' }])
  mockRequestSubmit.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig-retry')

  const { ok } = await submit([])

  expect(ok).toBe(true)
  // Nothing to persist — calling the endpoint with an empty list would be a
  // pointless round-trip, and on a server that validated it, an error.
  expect(mockAddProofs).not.toHaveBeenCalled()
  // It still seals what the escrow holds, which is the whole point.
  expect(mockRequestSubmit).toHaveBeenCalledWith('e1', proofHashFor(ARGS.chainId, ['u1', 'u2']))
})

test('the digest covers the whole stored set, not the batch handed in', async () => {
  // A worker who added a photo, then a receipt, then submitted used to seal
  // ONLY the receipt.
  mockAddProofs.mockResolvedValue(undefined)
  mockGetProofs.mockResolvedValue([{ url: 'photo' }, { url: 'receipt' }])
  mockRequestSubmit.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig')

  await submit([{ url: 'receipt', type: 'image' }])

  const sealed = mockRequestSubmit.mock.calls[0]?.[1]
  expect(sealed).toBe(proofHashFor(ARGS.chainId, ['photo', 'receipt']))
  expect(sealed).not.toBe(proofHashFor(ARGS.chainId, ['receipt']))
})

test('the read-back is SORTED, so row order cannot change the seal', async () => {
  // `GET /escrows/:id/proofs` declares no order. Two clients reading the same
  // evidence must still commit the same digest.
  mockAddProofs.mockResolvedValue(undefined)
  mockGetProofs.mockResolvedValue([{ url: 'b' }, { url: 'a' }, { url: 'c' }])
  mockRequestSubmit.mockResolvedValue(UNSIGNED)
  mockSignSendAndReport.mockResolvedValue('sig')

  await submit([{ url: 'c', type: 'image' }])

  expect(mockRequestSubmit).toHaveBeenCalledWith('e1', proofHashFor(ARGS.chainId, ['a', 'b', 'c']))
})

test('a failed READ-BACK says so, rather than blaming the upload', async () => {
  // The two legs carried one message until this split. Telling a worker their
  // files failed to save, at the one moment saving is what did work, sends
  // them to re-upload for nothing.
  mockAddProofs.mockResolvedValue(undefined)
  mockGetProofs.mockRejectedValue(new Error(''))

  const { ok, result } = await submit([{ url: 'u1', type: 'image' }])

  expect(ok).toBe(false)
  expect(mockShowToast).toHaveBeenCalledWith(
    'error',
    'Could not read the proof on this escrow, please try again',
  )
  expect(mockRequestSubmit).not.toHaveBeenCalled()
  // No stuck spinner: the wallet never opened.
  expect(result.current.phase).toBe('idle')
  expect(result.current.activeAction).toBeNull()
})

test('a failed UPLOAD still blames the upload, and never reads back', async () => {
  // The other side of the same split — the legs must not have swapped.
  mockAddProofs.mockRejectedValue(new Error(''))

  const { ok } = await submit([{ url: 'u1', type: 'image' }])

  expect(ok).toBe(false)
  expect(mockShowToast).toHaveBeenCalledWith('error', PROOF_COPY.saveFailed)
  expect(mockGetProofs).not.toHaveBeenCalled()
})

test("the server's own message wins over either fallback", async () => {
  mockAddProofs.mockRejectedValue(new Error('proof storage is full'))

  await submit([{ url: 'u1', type: 'image' }])

  expect(mockShowToast).toHaveBeenCalledWith('error', 'proof storage is full')
})
