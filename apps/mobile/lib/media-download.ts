/**
 * Download a media item to the device: images/videos are saved to the photo
 * gallery (needs permission), documents are handed to the OS share sheet.
 * Extracted from the viewer so the branching is unit-testable and so the
 * modern `expo-file-system` File API is the single import site.
 */
import { File, Paths } from 'expo-file-system'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import type { MediaItem, MediaKind } from '@/components/shared/media/types'

/** Extension fallback when the URL carries none (Cloudinary URLs usually do). */
const EXT_FALLBACK: Record<MediaKind, string> = {
  image: 'jpg',
  video: 'mp4',
  document: 'pdf',
}

export type DownloadResult =
  | { kind: 'saved'; mediaType: 'image' | 'video' }
  | { kind: 'shared' }
  | { kind: 'permission-denied'; canAskAgain: boolean }

/**
 * Fetch `item.url` into the app cache, then persist it. Throws when the
 * network fetch fails; returns a discriminated result otherwise so the caller
 * can render the right notice.
 */
export async function downloadMedia(item: MediaItem): Promise<DownloadResult> {
  const ext = item.url.split('?')[0].split('.').pop() || EXT_FALLBACK[item.type]
  const file = new File(Paths.cache, `tenda_media_${item.id}.${ext}`)

  const response = await fetch(item.url)
  if (!response.ok) throw new Error(`Server returned ${response.status}`)
  const buffer = await response.arrayBuffer()
  file.write(new Uint8Array(buffer))

  if (item.type === 'image' || item.type === 'video') {
    const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync()
    if (status !== 'granted') return { kind: 'permission-denied', canAskAgain }
    await MediaLibrary.saveToLibraryAsync(file.uri)
    return { kind: 'saved', mediaType: item.type }
  }

  await Sharing.shareAsync(file.uri)
  return { kind: 'shared' }
}
