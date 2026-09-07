import { useEffect, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { BellOff, X } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { Text } from '@/components/ui'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { shouldShowNudge, type NotificationPromptState } from '@/lib/notifications/policy'

/**
 * Tier 3, the throttled reminder for users who declined earlier.
 *
 * Silent until the first decline, then escalating backoff up to a hard cap, so
 * it reads as a reminder rather than nagware. Tapping it re-asks when the OS
 * prompt is still available and falls through to Settings when it is not.
 *
 * Renders full bleed: its own background spans the full width while the text
 * keeps the standard gutter, so it reads as a strip rather than a card. A host
 * that sits inside horizontal padding cancels it via `style`, which keeps
 * knowledge of the parent's gutter in the parent.
 */
export function NotificationNudgeBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { theme } = useUnistyles()
  const { permission, ask } = useNotificationPermission()

  const hydrated = useNotificationPromptStore((s) => s.hydrated)
  const softDeclinedAt = useNotificationPromptStore((s) => s.softDeclinedAt)
  const reminderCount = useNotificationPromptStore((s) => s.reminderCount)
  const lastRemindedAt = useNotificationPromptStore((s) => s.lastRemindedAt)
  const hasPrimedAtSignup = useNotificationPromptStore((s) => s.hasPrimedAtSignup)
  const commitmentCount = useNotificationPromptStore((s) => s.commitmentCount)
  const markReminded = useNotificationPromptStore((s) => s.markReminded)

  const [dismissed, setDismissed] = useState(false)
  // Latched, not derived: counting the reminder advances the backoff cursor,
  // which would immediately make shouldShowNudge false and tear the banner off
  // screen in the same tick. The decision is taken once per mount and held.
  const [due, setDue] = useState<boolean | null>(null)
  const decidedRef = useRef(false)

  const promptState: NotificationPromptState = {
    softDeclinedAt,
    reminderCount,
    lastRemindedAt,
    hasPrimedAtSignup,
    commitmentCount,
  }

  useEffect(() => {
    if (decidedRef.current || !hydrated || permission === null) return
    decidedRef.current = true

    const shouldShow = !permission.enabled && shouldShowNudge(promptState, Date.now())
    setDue(shouldShow)
    // Counted on appearance, not on eligibility, so the backoff never advances
    // for a banner the user was never shown.
    if (shouldShow) void markReminded()
    // promptState is read once at decision time on purpose, re-running on its
    // own writes is exactly the feedback loop this latch exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, permission, markReminded])

  // Still resolves live so granting permission (from this very banner) hides it.
  if (due !== true || dismissed || permission === null || permission.enabled) return null

  return (
    <Pressable
      onPress={() => {
        void ask()
      }}
      style={({ pressed }) => [
        s.banner,
        { backgroundColor: theme.colors.feedback.warning.surface },
        style,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Turn on notifications"
    >
      <BellOff size={16} color={theme.colors.feedback.warning.base} />
      <View style={s.body}>
        <Text style={[s.title, { color: theme.colors.content.primary }]}>
          Notifications are off
        </Text>
        <Text style={[s.sub, { color: theme.colors.content.secondary }]} numberOfLines={2}>
          You will miss gig updates, messages and payment releases.
        </Text>
      </View>
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={s.close}
      >
        <X size={15} color={theme.colors.content.tertiary} />
      </Pressable>
    </Pressable>
  )
}

const s = StyleSheet.create({
  banner: {
    // No horizontal margin and no radius: the strip spans full width, while
    // paddingHorizontal keeps its text on the same gutter as the feed cards.
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600', letterSpacing: -0.13 },
  sub: { fontSize: 11.5, lineHeight: 15, marginTop: 1 },
  close: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
})
