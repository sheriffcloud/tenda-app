import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator } from 'expo-image-manipulator'
import {
  pickAvatar,
  pickDocument,
  pickDocuments,
  pickImage,
  pickImages,
  pickVideos,
} from '../file-picker.operations'

const mockResize = jest.fn()
const mockSave = jest.fn()
const mockRender = jest.fn()

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}))
jest.mock('expo-file-system', () => ({ File: class { size = 123 } }))

const mockImagePicker = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>
const mockDocumentPicker = DocumentPicker.getDocumentAsync as jest.MockedFunction<
  typeof DocumentPicker.getDocumentAsync
>
const mockManipulate = ImageManipulator.manipulate as jest.MockedFunction<
  typeof ImageManipulator.manipulate
>

beforeEach(() => {
  jest.clearAllMocks()
  mockSave.mockResolvedValue({ uri: 'file://avatar.jpg' })
  mockRender.mockResolvedValue({ saveAsync: mockSave })
  const context = Object.assign(Object.create(null), {
    resize: mockResize,
    renderAsync: mockRender,
  })
  mockManipulate.mockReturnValue(context)
})

it('downscales and encodes oversized avatars', async () => {
  mockImagePicker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://source.jpg', width: 2048, height: 2048 }],
  })

  const result = await pickAvatar()

  expect(mockResize).toHaveBeenCalledWith({ width: 1024 })
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg' })
  expect(result).toEqual(expect.objectContaining({ uri: 'file://avatar.jpg', size: 123 }))
})

it('does not upscale a small avatar and returns null on picker failure', async () => {
  mockImagePicker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://small.jpg', width: 512, height: 512 }],
  })
  await pickAvatar()
  expect(mockResize).not.toHaveBeenCalled()

  mockImagePicker.mockRejectedValue(new Error('picker unavailable'))
  await expect(pickAvatar()).resolves.toBeNull()
})

it('returns null when avatar selection is cancelled', async () => {
  mockImagePicker.mockResolvedValue({ canceled: true, assets: null })
  await expect(pickAvatar()).resolves.toBeNull()
  expect(mockManipulate).not.toHaveBeenCalled()
})

it('maps selected images and preserves single-image behavior', async () => {
  mockImagePicker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://photo.jpg', width: 100, height: 100, fileName: null, fileSize: 50 }],
  })

  await expect(pickImage()).resolves.toEqual(expect.objectContaining({
    uri: 'file://photo.jpg',
    type: 'image',
    mimeType: 'image/jpeg',
    size: 50,
  }))
  expect(mockImagePicker).toHaveBeenCalledWith({
    mediaTypes: ['images'],
    quality: 0.85,
  })
})

it('returns null when single-image selection fails', async () => {
  mockImagePicker.mockRejectedValue(new Error('permission denied'))
  await expect(pickImage()).resolves.toBeNull()
})

it('returns empty image selections for cancellation and failures', async () => {
  mockImagePicker.mockResolvedValue({ canceled: true, assets: null })
  await expect(pickImages(3)).resolves.toEqual([])

  mockImagePicker.mockRejectedValue(new Error('permission denied'))
  await expect(pickImages(3)).resolves.toEqual([])
})

it('preserves image metadata supplied by the picker', async () => {
  mockImagePicker.mockResolvedValue({
    canceled: false,
    assets: [{
      uri: 'file://named.png',
      width: 100,
      height: 100,
      fileName: 'named.png',
      mimeType: 'image/png',
    }],
  })
  await expect(pickImages(2)).resolves.toEqual([
    expect.objectContaining({ name: 'named.png', mimeType: 'image/png' }),
  ])
})

it('maps videos and returns an empty list after failure', async () => {
  mockImagePicker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://clip.mp4', width: 100, height: 100, fileName: null }],
  })
  await expect(pickVideos(2)).resolves.toEqual([
    expect.objectContaining({ type: 'video', mimeType: 'video/mp4' }),
  ])

  mockImagePicker.mockRejectedValue(new Error('permission denied'))
  await expect(pickVideos(2)).resolves.toEqual([])
})

it('maps single and multiple documents with their respective picker modes', async () => {
  mockDocumentPicker.mockResolvedValue({
    canceled: false,
    assets: [{
      uri: 'file://proof.pdf',
      name: 'proof.pdf',
      mimeType: 'application/pdf',
      size: 90,
      lastModified: 1,
    }],
  })

  await expect(pickDocument(['application/pdf'])).resolves.toEqual(expect.objectContaining({
    name: 'proof.pdf',
    type: 'document',
  }))
  expect(mockDocumentPicker).toHaveBeenLastCalledWith({
    copyToCacheDirectory: true,
    type: ['application/pdf'],
  })

  await pickDocuments()
  expect(mockDocumentPicker).toHaveBeenLastCalledWith(expect.objectContaining({ multiple: true }))
})

it('returns empty document selections for cancellation and failures', async () => {
  mockDocumentPicker.mockResolvedValue({ canceled: true, assets: null })
  await expect(pickDocuments()).resolves.toEqual([])

  mockDocumentPicker.mockRejectedValue(new Error('picker unavailable'))
  await expect(pickDocuments()).resolves.toEqual([])
})

it('returns null when a single document is cancelled and supplies a MIME fallback', async () => {
  mockDocumentPicker.mockResolvedValue({ canceled: true, assets: null })
  await expect(pickDocument()).resolves.toBeNull()

  mockDocumentPicker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://raw', name: 'raw', lastModified: 1 }],
  })
  await expect(pickDocument()).resolves.toEqual(expect.objectContaining({
    mimeType: 'application/octet-stream',
  }))
})

it('returns null when single-document selection fails', async () => {
  mockDocumentPicker.mockRejectedValue(new Error('picker unavailable'))
  await expect(pickDocument()).resolves.toBeNull()
})
