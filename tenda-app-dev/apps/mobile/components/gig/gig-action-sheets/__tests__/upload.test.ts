/**
 * Proof upload, the batch rule and the failure toast.
 *
 * `uploadProofs` is all-or-nothing on purpose — a partial batch would leave the
 * worker unable to tell which files the escrow now holds — so the two things
 * worth proving are that a success returns the list IN ORDER with its types
 * intact, and that a failure names the file it was on and discards the rest.
 *
 * The twin is apps/web's lib/uploads/escrow-proofs.ts, tested alongside its
 * persist half; this module is the upload half alone.
 */
import type { PickedFile } from '@/components/form/FilePicker'

const mockUpload = jest.fn()
jest.mock('@/lib/upload', () => ({ uploadToCloudinary: (...a: unknown[]) => mockUpload(...a) }))
const mockToast = jest.fn()
jest.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))

// eslint-disable-next-line import/first
import { uploadProofs } from '../upload'

function picked(name: string, type: PickedFile['type']): PickedFile {
  return { uri: `file://${name}`, type, name, mimeType: 'application/octet-stream' }
}

const PHOTO = picked('a.jpg', 'image')
const DOC = picked('b.pdf', 'document')

test('returns one proof per file, in the order they were picked', async () => {
  // Order is load-bearing downstream: the proof hash commits to the LIST, so a
  // reordered batch is a different digest for the same evidence.
  mockUpload.mockResolvedValueOnce('https://cdn/a.jpg').mockResolvedValueOnce('https://cdn/b.pdf')

  await expect(uploadProofs([PHOTO, DOC])).resolves.toEqual([
    { url: 'https://cdn/a.jpg', type: 'image' },
    { url: 'https://cdn/b.pdf', type: 'document' },
  ])
  expect(mockToast).not.toHaveBeenCalled()
})

test('an empty pick uploads nothing and succeeds', async () => {
  // Not the same as a failure: there is nothing to attach, and returning null
  // here would read as "the upload broke" to the caller.
  await expect(uploadProofs([])).resolves.toEqual([])
  expect(mockUpload).not.toHaveBeenCalled()
})

test('one failed upload voids the whole batch and names the file', async () => {
  mockUpload.mockResolvedValueOnce('https://cdn/a.jpg').mockRejectedValueOnce(new Error('too big'))

  await expect(uploadProofs([PHOTO, DOC])).resolves.toBeNull()

  // The whole line, not just the filename: naming the file without saying WHY
  // it failed is the half of this toast that cannot be acted on.
  expect(mockToast).toHaveBeenCalledWith('error', 'Failed to upload "b.pdf": too big')
})

test('a failure with nothing to say names the file and stops there', async () => {
  // `throw null` is legal and a rejected promise can carry anything, so the
  // detail can be empty. Appending it unconditionally leaves `…"a.jpg": ` with
  // a dangling colon, which reads as a message that got truncated.
  mockUpload.mockRejectedValueOnce(null)

  await expect(uploadProofs([PHOTO])).resolves.toBeNull()

  expect(mockToast).toHaveBeenCalledWith('error', 'Failed to upload "a.jpg"')
})

test('the files after the failing one are never uploaded', async () => {
  // The batch is abandoned at the first failure, so a later file must not cost
  // the user another round trip to Cloudinary.
  mockUpload.mockRejectedValueOnce(new Error('nope'))

  await expect(uploadProofs([PHOTO, DOC])).resolves.toBeNull()

  expect(mockUpload).toHaveBeenCalledTimes(1)
})
