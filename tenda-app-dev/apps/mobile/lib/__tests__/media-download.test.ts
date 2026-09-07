/**
 * lib/media-download — download branching: image/video save to the gallery
 * (permission-gated), documents go to the share sheet, and a failed fetch
 * throws. Native modules are mocked so the logic is exercised, not the SDKs.
 */
const mockWrite = jest.fn()
const mockSaveToLibrary = jest.fn()
const mockRequestPermissions = jest.fn()
const mockShare = jest.fn()

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///cache/x',
    write: (data: Uint8Array) => mockWrite(data),
  })),
  Paths: { cache: 'file:///cache' },
}))
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: () => mockRequestPermissions(),
  saveToLibraryAsync: (uri: string) => mockSaveToLibrary(uri),
}))
jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string) => mockShare(uri),
}))

import { downloadMedia } from '@/lib/media-download'
import type { MediaItem } from '@/components/shared/media/types'

const okFetch = () =>
  Object.assign(jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })))

beforeEach(() => {
  jest.clearAllMocks()
  mockRequestPermissions.mockResolvedValue({ status: 'granted', canAskAgain: true })
  global.fetch = okFetch() as unknown as typeof fetch
})

const img: MediaItem = { id: 'm1', url: 'https://cdn/a.jpg', type: 'image' }
const vid: MediaItem = { id: 'm2', url: 'https://cdn/b.mp4', type: 'video' }
const doc: MediaItem = { id: 'm3', url: 'https://cdn/c.pdf', type: 'document' }

it('image with permission → saved to gallery', async () => {
  const res = await downloadMedia(img)
  expect(res).toEqual({ kind: 'saved', mediaType: 'image' })
  expect(mockWrite).toHaveBeenCalled()
  expect(mockSaveToLibrary).toHaveBeenCalledWith('file:///cache/x')
  expect(mockShare).not.toHaveBeenCalled()
})

it('video with permission → saved to gallery', async () => {
  const res = await downloadMedia(vid)
  expect(res).toEqual({ kind: 'saved', mediaType: 'video' })
})

it('document → share sheet (no gallery permission needed)', async () => {
  const res = await downloadMedia(doc)
  expect(res).toEqual({ kind: 'shared' })
  expect(mockShare).toHaveBeenCalledWith('file:///cache/x')
  expect(mockRequestPermissions).not.toHaveBeenCalled()
})

it('image with permission denied → permission-denied (not saved)', async () => {
  mockRequestPermissions.mockResolvedValue({ status: 'denied', canAskAgain: false })
  const res = await downloadMedia(img)
  expect(res).toEqual({ kind: 'permission-denied', canAskAgain: false })
  expect(mockSaveToLibrary).not.toHaveBeenCalled()
})

it('failed fetch throws', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
  await expect(downloadMedia(img)).rejects.toThrow('Server returned 500')
})

it('URL without an extension falls back to the type default (no crash)', async () => {
  // Trailing dot → empty parsed extension → EXT_FALLBACK kicks in.
  const res = await downloadMedia({ id: 'm4', url: 'https://cdn/file.', type: 'document' })
  expect(res).toEqual({ kind: 'shared' })
  expect(mockShare).toHaveBeenCalled()
})
