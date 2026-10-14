/**
 * fileProofMediaItems — the proof→media boundary. EscrowProof used to be
 * structurally a MediaItem; with the data proof types it is not, and this is
 * the one place that decides which rows the media surfaces (grid, viewer)
 * receive.
 */
import type { EscrowProof } from '@tenda/shared'
import { fileProofMediaItems } from '../file-proofs'

const row = (over: Partial<EscrowProof>): EscrowProof => ({
  id: 'p1',
  escrow_id: 'e1',
  url: 'https://cdn/a.jpg',
  payload: null,
  type: 'image',
  uploaded_at: new Date(0),
  ...over,
})

it('maps file proofs to media items, keeping id/url/type', () => {
  expect(
    fileProofMediaItems([
      row({ id: 'p1', type: 'image' }),
      row({ id: 'p2', type: 'video', url: 'https://cdn/b.mp4' }),
      row({ id: 'p3', type: 'document', url: 'https://cdn/c.pdf' }),
    ]),
  ).toEqual([
    { id: 'p1', url: 'https://cdn/a.jpg', type: 'image' },
    { id: 'p2', url: 'https://cdn/b.mp4', type: 'video' },
    { id: 'p3', url: 'https://cdn/c.pdf', type: 'document' },
  ])
})

it('drops data proofs — a payload row has no url to open as media', () => {
  expect(
    fileProofMediaItems([
      row({ id: 'p1' }),
      row({ id: 'p2', type: 'geotag', url: null, payload: { latitude: 1, longitude: 2 } }),
      row({ id: 'p3', type: 'text', url: null, payload: { text: 'done' } }),
    ]),
  ).toEqual([{ id: 'p1', url: 'https://cdn/a.jpg', type: 'image' }])
})

it('answers an empty list for no proofs', () => {
  expect(fileProofMediaItems([])).toEqual([])
})
