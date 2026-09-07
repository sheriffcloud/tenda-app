import { StyleSheet } from 'react-native'
import { VideoView, useVideoPlayer, type VideoPlayer } from 'expo-video'

/**
 * Standalone so `useVideoPlayer` is always called unconditionally (hooks
 * rule) — the viewer only mounts this when the item is actually a video.
 */
export function InAppVideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p: VideoPlayer) => {
    p.loop = false
    p.play()
  })
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls />
}
