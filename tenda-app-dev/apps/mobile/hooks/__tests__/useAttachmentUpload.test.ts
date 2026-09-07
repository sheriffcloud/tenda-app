/**
 * useAttachmentUpload — pick → upload → hand back the attachment. Pickers,
 * the Cloudinary uploader, and the toast are mocked so we assert the flow and
 * its error handling, not the SDKs.
 */
const mockPickImage = jest.fn()
const mockPickDocument = jest.fn()
const mockUpload = jest.fn()
const mockToast = jest.fn()

jest.mock('@/components/form/FilePicker', () => ({
  pickImage: (...a: unknown[]) => mockPickImage(...a),
  pickDocument: (...a: unknown[]) => mockPickDocument(...a),
}))
jest.mock('@/lib/upload', () => ({
  uploadToCloudinaryDetailed: (...a: unknown[]) => mockUpload(...a),
}))
jest.mock('@/components/ui/Toast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }))

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useAttachmentUpload } from '@/hooks/useAttachmentUpload'

beforeEach(() => jest.clearAllMocks())

it('picks an image, uploads to the scope, and hands back the mapped attachment', async () => {
  mockPickImage.mockResolvedValue({ uri: 'file://a.jpg', type: 'image', name: 'a.jpg', mimeType: 'image/jpeg' })
  mockUpload.mockResolvedValue({ url: 'https://cdn/a.jpg', bytes: 1234 })
  const onUploaded = jest.fn()

  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'dispute', scopeId: 'escrow-1', onUploaded }),
  )
  await act(async () => {
    await result.current.pick('image')
  })

  expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file://a.jpg' }), 'dispute', 'escrow-1')
  expect(onUploaded).toHaveBeenCalledWith({ url: 'https://cdn/a.jpg', type: 'image', size: 1234 })
  expect(result.current.uploading).toBe(false)
})

it('picks a PDF document and maps its type to file', async () => {
  mockPickDocument.mockResolvedValue({ uri: 'file://d.pdf', type: 'document', name: 'd.pdf', mimeType: 'application/pdf' })
  mockUpload.mockResolvedValue({ url: 'https://cdn/d.pdf', bytes: 999 })
  const onUploaded = jest.fn()

  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'dispute', scopeId: 'escrow-1', onUploaded }),
  )
  await act(async () => {
    await result.current.pick('document')
  })

  expect(mockPickDocument).toHaveBeenCalledWith(['application/pdf'])
  expect(onUploaded).toHaveBeenCalledWith({ url: 'https://cdn/d.pdf', type: 'file', size: 999 })
})

it('cancelled pick → nothing uploaded', async () => {
  mockPickImage.mockResolvedValue(null)
  const onUploaded = jest.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'chat', scopeId: 'conv-1', onUploaded }),
  )
  await act(async () => {
    await result.current.pick('image')
  })
  expect(mockUpload).not.toHaveBeenCalled()
  expect(onUploaded).not.toHaveBeenCalled()
})

it('null scope → no-op (nothing picked)', async () => {
  const onUploaded = jest.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'chat', scopeId: null, onUploaded }),
  )
  await act(async () => {
    await result.current.pick('image')
  })
  expect(mockPickImage).not.toHaveBeenCalled()
})

it('upload failure → toast, no callback, uploading reset', async () => {
  mockPickImage.mockResolvedValue({ uri: 'file://a.jpg', type: 'image', name: 'a.jpg', mimeType: 'image/jpeg' })
  mockUpload.mockRejectedValue(new Error('Upload timed out'))
  const onUploaded = jest.fn()
  const { result } = renderHook(() =>
    useAttachmentUpload({ type: 'dispute', scopeId: 'escrow-1', onUploaded }),
  )
  await act(async () => {
    await result.current.pick('image')
  })
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('error', 'Upload timed out'))
  expect(onUploaded).not.toHaveBeenCalled()
  expect(result.current.uploading).toBe(false)
})
