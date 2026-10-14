/**
 * The pick→upload→hand-back flow shared by chat and (S6.1) disputes:
 * success maps File MIME → wire attachment type with Cloudinary's
 * authoritative byte count; failure toasts and never calls onUploaded;
 * a missing scope is a hard no-op.
 */
import { renderHook, act } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const uploadToCloudinaryDetailed = vi.hoisted(() =>
  vi.fn<(file: File, type: string, scopeId?: string) => Promise<{ url: string; bytes: number }>>(),
)
const showToast = vi.hoisted(() => vi.fn())

vi.mock('@/lib/uploads/upload', () => ({ uploadToCloudinaryDetailed }))
vi.mock('@/components/ui/Toast', () => ({ showToast }))

import { useAttachmentUpload } from '@/hooks/uploads/useAttachmentUpload'

beforeEach(() => {
  vi.clearAllMocks()
})

test('uploads into the scope and hands back url + mapped type + authoritative size', async () => {
  uploadToCloudinaryDetailed.mockResolvedValue({ url: 'https://cdn/x.png', bytes: 512 })
  const onUploaded = vi.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'chat', scopeId: 'c1', onUploaded }),
  )
  await act(() => result.current.upload(new File(['x'], 'x.png', { type: 'image/png' })))
  expect(uploadToCloudinaryDetailed).toHaveBeenCalledWith(expect.any(File), 'chat', 'c1')
  expect(onUploaded).toHaveBeenCalledWith({ url: 'https://cdn/x.png', type: 'image', size: 512 })
})

test('a PDF maps to the file attachment type', async () => {
  uploadToCloudinaryDetailed.mockResolvedValue({ url: 'https://cdn/d.pdf', bytes: 2048 })
  const onUploaded = vi.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'chat', scopeId: 'c1', onUploaded }),
  )
  await act(() => result.current.upload(new File(['x'], 'd.pdf', { type: 'application/pdf' })))
  expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }))
})

test('an upload failure toasts the message and never hands anything back', async () => {
  uploadToCloudinaryDetailed.mockRejectedValue(new Error('File is too large, max 10 MB'))
  const onUploaded = vi.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'chat', scopeId: 'c1', onUploaded }),
  )
  await act(() => result.current.upload(new File(['x'], 'big.png', { type: 'image/png' })))
  expect(showToast).toHaveBeenCalledWith('error', 'File is too large, max 10 MB')
  expect(onUploaded).not.toHaveBeenCalled()
  expect(result.current.uploading).toBe(false)
})

test('no scope id → hard no-op (the thread has not resolved yet)', async () => {
  const onUploaded = vi.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'chat', scopeId: null, onUploaded }),
  )
  await act(() => result.current.upload(new File(['x'], 'x.png', { type: 'image/png' })))
  expect(uploadToCloudinaryDetailed).not.toHaveBeenCalled()
})
