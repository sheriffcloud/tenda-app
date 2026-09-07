import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import type { PickedFile } from './file-picker.types'

const AVATAR_MAXIMUM_DIMENSION = 1024
const AVATAR_COMPRESSION_QUALITY = 0.8
const MEDIA_PICKER_QUALITY = 0.85

function toPickedImage(asset: ImagePicker.ImagePickerAsset): PickedFile {
  return {
    uri: asset.uri,
    type: 'image',
    name: asset.fileName ?? `photo_${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize,
  }
}

function toPickedDocument(asset: DocumentPicker.DocumentPickerAsset): PickedFile {
  return {
    uri: asset.uri,
    type: 'document',
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size,
  }
}

export async function pickAvatar(): Promise<PickedFile | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    if (result.canceled || !result.assets?.length) return null

    const asset = result.assets[0]
    const context = ImageManipulator.manipulate(asset.uri)
    if (typeof asset.width === 'number' && asset.width > AVATAR_MAXIMUM_DIMENSION) {
      context.resize({ width: AVATAR_MAXIMUM_DIMENSION })
    }
    const rendered = await context.renderAsync()
    const output = await rendered.saveAsync({
      compress: AVATAR_COMPRESSION_QUALITY,
      format: SaveFormat.JPEG,
    })
    const size = new File(output.uri).size ?? undefined

    return {
      uri: output.uri,
      type: 'image',
      name: `avatar_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      ...(size !== undefined ? { size } : {}),
    }
  } catch {
    return null
  }
}

export async function pickImage(): Promise<PickedFile | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: MEDIA_PICKER_QUALITY,
    })
    if (result.canceled || !result.assets?.length) return null
    return toPickedImage(result.assets[0])
  } catch {
    return null
  }
}

export async function pickImages(limit: number): Promise<PickedFile[]> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: MEDIA_PICKER_QUALITY,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
    })
    if (result.canceled || !result.assets?.length) return []
    return result.assets.map(toPickedImage)
  } catch {
    return []
  }
}

export async function pickVideos(limit: number): Promise<PickedFile[]> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: MEDIA_PICKER_QUALITY,
      allowsMultipleSelection: true,
      selectionLimit: limit,
    })
    if (result.canceled || !result.assets?.length) return []
    return result.assets.map((asset) => ({
      uri: asset.uri,
      type: 'video',
      name: asset.fileName ?? `video_${Date.now()}.mp4`,
      mimeType: asset.mimeType ?? 'video/mp4',
    }))
  } catch {
    return []
  }
}

export async function pickDocument(mimeTypes?: string[]): Promise<PickedFile | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      ...(mimeTypes !== undefined ? { type: mimeTypes } : {}),
    })
    if (result.canceled || !result.assets?.length) return null
    return toPickedDocument(result.assets[0])
  } catch {
    return null
  }
}

export async function pickDocuments(mimeTypes?: string[]): Promise<PickedFile[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      ...(mimeTypes !== undefined ? { type: mimeTypes } : {}),
    })
    if (result.canceled || !result.assets?.length) return []
    return result.assets.map(toPickedDocument)
  } catch {
    return []
  }
}
