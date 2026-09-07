/**
 * Full-screen media viewer: pinch-to-zoom images, in-app video playback, and
 * a download action (gallery save for image/video, share sheet for docs).
 * Neutral over the source of the media — used for escrow proofs and for chat /
 * dispute message attachments alike.
 */
import { useState } from 'react'
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUnistyles } from 'react-native-unistyles'
import { X, Download, FileText } from 'lucide-react-native'
import { Text } from '@/components/ui/Text'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { downloadMedia } from '@/lib/media-download'
import { spacing, radius } from '@/theme/tokens'
import { InAppVideoPlayer } from './InAppVideoPlayer'
import type { MediaItem } from './types'

interface Props {
  item: MediaItem | null
  onClose: () => void
}

export function MediaViewerModal({ item, onClose }: Props) {
  const { theme } = useUnistyles()
  const insets = useSafeAreaInsets()
  const [downloading, setDownloading] = useState(false)
  const [permissionPrompt, setPermissionPrompt] = useState(false)
  // A success/failure notice, shown via our dialog because a toast would render
  // BEHIND this fullscreen modal.
  const [notice, setNotice] = useState<string | null>(null)

  if (!item) return null

  async function handleDownload() {
    if (!item) return
    setDownloading(true)
    try {
      const result = await downloadMedia(item)
      if (result.kind === 'permission-denied') {
        if (!result.canAskAgain) setPermissionPrompt(true)
      } else if (result.kind === 'saved') {
        setNotice(`${result.mediaType === 'image' ? 'Image' : 'Video'} saved to your gallery.`)
      }
      // 'shared': the OS share sheet is its own feedback, no notice needed.
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not download the file.')
    } finally {
      setDownloading(false)
    }
  }

  const typeLabel =
    item.type === 'image' ? 'IMAGE' : item.type === 'video' ? 'VIDEO' : 'DOCUMENT'

  // Black background is intentional, matches system gallery/camera UX.
  // Overlays are relative to that fixed black bg, not theme-dependent.
  const OVERLAY_DIM = 'rgba(255,255,255,0.12)'
  const OVERLAY_TEXT = 'rgba(255,255,255,0.5)'

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.container}>

        {/* ── Top bar ── */}
        <View style={[s.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <View style={[s.typeBadge, { backgroundColor: OVERLAY_DIM }]}>
            <Text variant="caption" color="#fff" weight="semibold" style={s.typeLabel}>
              {typeLabel}
            </Text>
          </View>
          <View style={s.topBarActions}>
            {downloading ? (
              <ActivityIndicator color="#fff" style={s.iconBtn} />
            ) : (
              <Pressable onPress={handleDownload} style={s.iconBtn} hitSlop={12} accessibilityLabel="Download">
                <Download size={22} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={onClose} style={s.iconBtn} hitSlop={12} accessibilityLabel="Close">
              <X size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* ── Content ── */}
        {item.type === 'image' && (
          <ScrollView
            style={s.flex}
            contentContainerStyle={s.imageContainer}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: item.url }}
              style={s.fullImage}
              contentFit="contain"
              transition={200}
            />
          </ScrollView>
        )}

        {item.type === 'video' && (
          <View style={s.flex}>
            <InAppVideoPlayer url={item.url} />
          </View>
        )}

        {item.type === 'document' && (
          <View style={s.mediaCenter}>
            <View style={[s.iconCircle, { backgroundColor: OVERLAY_DIM }]}>
              <FileText size={52} color="#fff" />
            </View>
            <Text variant="subheading" color="#fff" style={s.centred}>
              Document
            </Text>
            <Text variant="caption" color={OVERLAY_TEXT} style={s.centred}>
              Opens in your browser
            </Text>
            <Pressable
              style={[s.openBtn, { backgroundColor: theme.colors.brand.primary }]}
              onPress={() => Linking.openURL(item.url)}
            >
              <Text variant="body" weight="semibold" color={theme.colors.brand.onPrimary}>
                Open document
              </Text>
            </Pressable>
          </View>
        )}

      </View>

      <ConfirmDialog
        visible={permissionPrompt}
        title="Permission required"
        message="Gallery access was denied. Enable it in your device settings."
        confirmLabel="Open Settings"
        onConfirm={() => {
          setPermissionPrompt(false)
          void Linking.openSettings()
        }}
        onCancel={() => setPermissionPrompt(false)}
      />

      <ConfirmDialog
        visible={notice !== null}
        title="Download"
        message={notice ?? undefined}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setNotice(null)}
        onCancel={() => setNotice(null)}
      />
    </Modal>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  typeLabel: {
    letterSpacing: 0.8,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    padding: 8,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    flex: 1,
  },
  mediaCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  centred: {
    textAlign: 'center',
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
})
