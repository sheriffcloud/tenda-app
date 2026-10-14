/**
 * lib/upload — the browser Cloudinary leg: the signed params all ride the
 * form, the pre-flight size guard, the 120s abort mapping, and Cloudinary's
 * own error surfacing.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { signatureMock } = vi.hoisted(() => ({ signatureMock: vi.fn() }))
vi.mock('@/api/client', () => ({
  api: { upload: { signature: (...a: unknown[]) => signatureMock(...a) } },
}))

import { uploadToCloudinary, uploadToCloudinaryDetailed } from '@/lib/uploads/upload'

const SIGNED = {
  signature: 'sig',
  timestamp: 1700000000,
  cloud_name: 'tenda',
  api_key: 'key',
  folder: 'proofs/e1',
  allowed_formats: 'jpg,png,pdf',
  max_file_bytes: 10 * 1024 * 1024,
}

const realFetch = globalThis.fetch
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  signatureMock.mockResolvedValue(SIGNED)
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ secure_url: 'https://cdn/x.jpg', bytes: 123 }),
  }))
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function file(name = 'proof.jpg', size = 1000): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' })
}

test('posts the file with every signed param to the auto/upload endpoint', async () => {
  const result = await uploadToCloudinaryDetailed(file(), 'proof', 'e1')
  expect(result).toEqual({ url: 'https://cdn/x.jpg', bytes: 123 })
  expect(signatureMock).toHaveBeenCalledWith({ type: 'proof', scope_id: 'e1' })
  const [url, init] = fetchMock.mock.calls[0] as [string, { body: FormData }]
  expect(url).toBe('https://api.cloudinary.com/v1_1/tenda/auto/upload')
  const form = init.body
  expect(form.get('api_key')).toBe('key')
  expect(form.get('signature')).toBe('sig')
  expect(form.get('timestamp')).toBe('1700000000')
  expect(form.get('folder')).toBe('proofs/e1')
  // Signed param — must be sent or Cloudinary rejects the signature.
  expect(form.get('allowed_formats')).toBe('jpg,png,pdf')
  expect(form.get('file')).toBeInstanceOf(File)
})

test('unscoped types omit scope_id', async () => {
  await uploadToCloudinary(file(), 'proof')
  expect(signatureMock).toHaveBeenCalledWith({ type: 'proof' })
})

test('an oversized file is refused BEFORE any upload', async () => {
  await expect(
    uploadToCloudinaryDetailed(file('big.jpg', SIGNED.max_file_bytes + 1), 'proof'),
  ).rejects.toThrow(/max 10 MB/)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('an oversized AVATAR is refused with a real error, at the cap the SERVER set', async () => {
  // The cap is not a client constant: it rides the signature response per
  // upload kind, so raising it server-side raises it here with no deploy.
  // Read from SIGNED, never restated: this test's whole point is that the
  // cap comes from the server's response, so hardcoding it here would prove
  // the opposite of what it claims.
  signatureMock.mockResolvedValue({ ...SIGNED, folder: 'avatars' })
  await expect(
    uploadToCloudinaryDetailed(file('huge.jpg', SIGNED.max_file_bytes + 1), 'avatar'),
  ).rejects.toThrow('File is too large, max 10 MB')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('an avatar exactly at the cap is allowed through', async () => {
  // The guard is `>`, not `>=` — a file on the boundary is legal, and an
  // off-by-one here would reject a perfectly valid upload.
  signatureMock.mockResolvedValue({ ...SIGNED, folder: 'avatars' })
  await expect(
    uploadToCloudinaryDetailed(file('exact.jpg', SIGNED.max_file_bytes), 'avatar'),
  ).resolves.toBeDefined()
  expect(fetchMock).toHaveBeenCalled()
})

test("Cloudinary's own error message surfaces on a non-OK response", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    json: async () => ({ error: { message: 'Invalid signature' } }),
  })
  await expect(uploadToCloudinary(file(), 'proof')).rejects.toThrow('Invalid signature')
})

test('an abort maps to the timeout message', async () => {
  const abortError = new Error('aborted')
  abortError.name = 'AbortError'
  fetchMock.mockRejectedValue(abortError)
  await expect(uploadToCloudinary(file(), 'proof')).rejects.toThrow(/timed out/)
})
