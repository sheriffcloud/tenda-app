/**
 * attachedProofUrls — the list the on-chain submit digest seals. Canonical
 * order, and (since the data proof types) canonical PAYLOAD JSON for rows
 * with no url. apps/web's attachedProofUrls is the twin: the two clients must
 * seal the same digest over the same evidence, so these pins mirror its suite.
 */
import { api } from '@/api/client'
import { attachedProofUrls } from '../attachedProofUrls'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { escrows: { proofs: jest.fn() } },
}))

const proofsMock = api.escrows.proofs as jest.Mock

it('answers a CANONICAL sorted list whatever order the server sends', async () => {
  proofsMock.mockResolvedValueOnce([
    { url: 'https://cdn/z.pdf', type: 'document', payload: null },
    { url: 'https://cdn/a.jpg', type: 'image', payload: null },
  ])
  await expect(attachedProofUrls('e1')).resolves.toEqual([
    'https://cdn/a.jpg',
    'https://cdn/z.pdf',
  ])
  expect(proofsMock).toHaveBeenCalledWith({ id: 'e1' })
})

it('seals data proofs as canonical JSON, key order blind', async () => {
  proofsMock.mockResolvedValueOnce([
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

it('answers an empty list for an escrow with no evidence', async () => {
  proofsMock.mockResolvedValueOnce([])
  await expect(attachedProofUrls('e1')).resolves.toEqual([])
})
