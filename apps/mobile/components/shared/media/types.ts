/**
 * Media descriptor shared by the full-screen viewer, the proofs grid, the
 * message-attachment preview, and the download helper. Kept dependency-free
 * (no native imports) so any of those can import the type without dragging
 * `expo-video`/`expo-media-library` into its bundle or jest suite.
 */
export type MediaKind = 'image' | 'video' | 'document'

export interface MediaItem {
  id: string
  url: string
  type: MediaKind
}
