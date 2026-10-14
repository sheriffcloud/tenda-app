/**
 * lib/escrow-proofs — the lost-response resolution (a REQUEST_TIMEOUT reads
 * back what actually persisted) and the all-or-nothing upload batch.
 */
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiClientError } from '@tenda/shared'

const { addProofsMock, proofsMock, uploadMock, toastMock } = vi.hoisted(() => ({
  addProofsMock: vi.fn(),
  proofsMock: vi.fn(),
  uploadMock: vi.fn(),
  toastMock: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  api: {
    escrows: {
      addProofs: (...a: unknown[]) => addProofsMock(...a),
      proofs: (...a: unknown[]) => proofsMock(...a),
    },
  },
}))
vi.mock('@/lib/uploads/upload', () => ({ uploadToCloudinary: (...a: unknown[]) => uploadMock(...a) }))
vi.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => toastMock(...a) }))

import { attachedProofUrls, persistEscrowProofs, uploadProofs } from '@/lib/uploads/escrow-proofs'

const PROOFS = [{ url: 'https://cdn/a.jpg', type: 'image' as const }]

beforeEach(() => {
  addProofsMock.mockResolvedValue({})
  uploadMock.mockResolvedValue('https://cdn/a.jpg')
})

test('persists via addProofs on the happy path', async () => {
  await persistEscrowProofs('e1', PROOFS)
  expect(addProofsMock).toHaveBeenCalledWith({ id: 'e1' }, { proofs: PROOFS })
  expect(proofsMock).not.toHaveBeenCalled()
})

test('a REQUEST_TIMEOUT resolves by reading back — success when everything persisted', async () => {
  addProofsMock.mockRejectedValue(new ApiClientError(408, 'Timeout', 'slow', 'REQUEST_TIMEOUT'))
  proofsMock.mockResolvedValue(PROOFS)
  await persistEscrowProofs('e1', PROOFS)
})

test('a REQUEST_TIMEOUT with rows missing still fails', async () => {
  addProofsMock.mockRejectedValue(new ApiClientError(408, 'Timeout', 'slow', 'REQUEST_TIMEOUT'))
  proofsMock.mockResolvedValue([])
  await expect(persistEscrowProofs('e1', PROOFS)).rejects.toThrow('slow')
})

test('other failures rethrow without a read-back', async () => {
  addProofsMock.mockRejectedValue(new ApiClientError(500, 'Internal', 'boom', 'INTERNAL_ERROR'))
  await expect(persistEscrowProofs('e1', PROOFS)).rejects.toThrow('boom')
  expect(proofsMock).not.toHaveBeenCalled()
})

test('attachedProofUrls reads the escrow back and answers a CANONICAL order', async () => {
  // This is what the on-chain submit seals, so it must not depend on the order
  // rows happen to come back in: `GET /escrows/:id/proofs` declares none, and
  // two clients hashing the same evidence in a different order would commit
  // two different digests for it.
  proofsMock.mockResolvedValue([
    { url: 'https://cdn/z.pdf', type: 'document' },
    { url: 'https://cdn/a.jpg', type: 'image' },
    { url: 'https://cdn/m.mp4', type: 'video' },
  ])
  await expect(attachedProofUrls('e1')).resolves.toEqual([
    'https://cdn/a.jpg',
    'https://cdn/m.mp4',
    'https://cdn/z.pdf',
  ])
  expect(proofsMock).toHaveBeenCalledWith({ id: 'e1' })
})

test('attachedProofUrls answers the same list whatever order the server sends', async () => {
  proofsMock.mockResolvedValue([
    { url: 'https://cdn/a.jpg', type: 'image' },
    { url: 'https://cdn/z.pdf', type: 'document' },
  ])
  const ascending = await attachedProofUrls('e1')
  proofsMock.mockResolvedValue([
    { url: 'https://cdn/z.pdf', type: 'document' },
    { url: 'https://cdn/a.jpg', type: 'image' },
  ])
  await expect(attachedProofUrls('e1')).resolves.toEqual(ascending)
})

test('attachedProofUrls answers an empty list for an escrow with no evidence', async () => {
  // Not a crash and not a throw: the caller decides what an empty set means.
  proofsMock.mockResolvedValue([])
  await expect(attachedProofUrls('e1')).resolves.toEqual([])
})

test('attachedProofUrls seals data proofs as canonical JSON, key order blind', async () => {
  // A data proof has no url — the digest covers its PAYLOAD, canonicalised so
  // the same evidence seals identically whatever key order it was stored with.
  proofsMock.mockResolvedValue([
    { url: 'https://cdn/a.jpg', type: 'image', payload: null },
    { url: null, type: 'geotag', payload: { longitude: 3.3792, latitude: 6.5244 } },
    { url: null, type: 'text', payload: { text: 'done' } },
  ])
  await expect(attachedProofUrls('e1')).resolves.toEqual([
    // Code-unit sort: 'h' (0x68) precedes '{' (0x7B), so urls lead.
    'https://cdn/a.jpg',
    '{"latitude":6.5244,"longitude":3.3792}',
    '{"text":"done"}',
  ])
})

test('uploadProofs uploads in order and returns the proof list', async () => {
  uploadMock.mockResolvedValueOnce('https://cdn/1.jpg').mockResolvedValueOnce('https://cdn/2.pdf')
  const files = [
    { file: new File(['a'], 'a.jpg', { type: 'image/jpeg' }), type: 'image' as const },
    { file: new File(['b'], 'b.pdf', { type: 'application/pdf' }), type: 'document' as const },
  ]
  await expect(uploadProofs(files)).resolves.toEqual([
    { url: 'https://cdn/1.jpg', type: 'image' },
    { url: 'https://cdn/2.pdf', type: 'document' },
  ])
})

test('one failed upload voids the whole batch with a named toast', async () => {
  uploadMock.mockResolvedValueOnce('https://cdn/1.jpg').mockRejectedValueOnce(new Error('too big'))
  const files = [
    { file: new File(['a'], 'a.jpg', { type: 'image/jpeg' }), type: 'image' as const },
    { file: new File(['b'], 'b.pdf', { type: 'application/pdf' }), type: 'document' as const },
  ]
  await expect(uploadProofs(files)).resolves.toBeNull()
  // The whole line, not just the filename: naming the file without saying WHY
  // it failed is the half of this toast that cannot be acted on.
  expect(toastMock).toHaveBeenCalledWith('error', 'Failed to upload "b.pdf": too big')
})

test('a failure with nothing to say names the file and stops there', async () => {
  // `throw null` is legal and a rejected promise can carry anything, so the
  // detail can be empty. Appending it unconditionally leaves `…"b.pdf": ` with
  // a dangling colon, which reads as a message that got truncated.
  uploadMock.mockRejectedValueOnce(null)
  const files = [{ file: new File(['b'], 'b.pdf', { type: 'application/pdf' }), type: 'document' as const }]

  await expect(uploadProofs(files)).resolves.toBeNull()

  expect(toastMock).toHaveBeenCalledWith('error', 'Failed to upload "b.pdf"')
})
