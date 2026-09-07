import { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { RotateCcw, X } from 'lucide-react-native'
import { typography } from '@/theme/tokens'
import { Text, Spacer, BottomSheet } from '@/components/ui'
import { usePendingSyncStore, PENDING_SYNC_ACTION_LABEL, type PendingSync } from '@/stores/pending-sync.store'

function FailedSyncItem({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingSync
  onRetry: () => void
  onDismiss: () => void
}) {
  const { theme } = useUnistyles()
  const date = new Date(item.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })

  return (
    <View style={[s.item, { borderBottomColor: theme.colors.border.subtle }]}>
      <View style={s.itemBody}>
        <Text size={14.5} weight="semibold" color={theme.colors.content.primary}>
          {PENDING_SYNC_ACTION_LABEL[item.action]}
        </Text>
        <Text style={s.sig} color={theme.colors.content.tertiary} numberOfLines={1}>
          {item.signature.slice(0, 16)}…
        </Text>
        <Text size={11.5} color={theme.colors.content.tertiary}>{date}</Text>
      </View>

      <View style={s.itemActions}>
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => [
            s.actionBtn,
            { backgroundColor: theme.colors.brand.primarySurface },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Retry transaction"
        >
          <RotateCcw size={12} color={theme.colors.brand.primary} />
          <Text size={12} weight="semibold" color={theme.colors.brand.primary}>Retry</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          style={({ pressed }) => [
            s.actionBtn,
            { backgroundColor: theme.colors.surface.inset },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Dismiss transaction"
        >
          <X size={12} color={theme.colors.content.secondary} />
          <Text size={12} weight="medium" color={theme.colors.content.secondary}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function FailedSyncPanel() {
  const { theme } = useUnistyles()
  const failed        = usePendingSyncStore((s) => s.failed)
  const retryFailed   = usePendingSyncStore((s) => s.retryFailed)
  const dismissFailed = usePendingSyncStore((s) => s.dismissFailed)

  const [sheetVisible, setSheetVisible] = useState(false)

  if (failed.length === 0) return null

  function handleRetry(id: string) {
    retryFailed(id)
    if (failed.length === 1) setSheetVisible(false)
  }

  function handleDismiss(id: string) {
    dismissFailed(id)
    if (failed.length === 1) setSheetVisible(false)
  }

  const noun = failed.length === 1 ? 'transaction needs' : `${failed.length} transactions need`
  const warningTextColor = theme.colors.feedback.warning.text

  return (
    <>
      <Pressable
        onPress={() => setSheetVisible(true)}
        style={({ pressed }) => [
          s.banner,
          { backgroundColor: theme.colors.feedback.warning.surface },
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Review failed transactions"
      >
        <View style={[s.dot, { backgroundColor: theme.colors.feedback.warning.base }]} />
        <Text style={[s.bannerText, { color: warningTextColor }]} numberOfLines={1}>
          <Text style={[s.bannerTextStrong, { color: warningTextColor }]}>
            Sync paused.{' '}
          </Text>
          {noun} attention.
        </Text>
        <Text style={[s.retryLabel, { color: theme.colors.brand.primary }]}>
          Retry
        </Text>
      </Pressable>

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title="Transactions needing attention"
      >
        <Text size={13} color={theme.colors.content.secondary} style={s.sheetIntro}>
          These transactions were confirmed on-chain but could not be recorded on our server. Retry to sync, or dismiss if the gig status already looks correct.
        </Text>
        {failed.map((item) => (
          <FailedSyncItem
            key={item.id}
            item={item}
            onRetry={() => handleRetry(item.id)}
            onDismiss={() => handleDismiss(item.id)}
          />
        ))}
        <Spacer size={12} />
      </BottomSheet>
    </>
  )
}

const s = StyleSheet.create({
  banner: {
    marginHorizontal: 20,
    marginBottom: 4,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  bannerTextStrong: {
    fontWeight: '600',
  },
  retryLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    flexShrink: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  sig: {
    fontFamily: typography.fonts.mono,
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: 0.115,
  },
  itemActions: {
    gap: 6,
    alignItems: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  sheetIntro: {
    lineHeight: 18,
    marginBottom: 12,
  },
})
