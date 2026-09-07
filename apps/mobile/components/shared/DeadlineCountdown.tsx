import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { AppTheme } from '@/theme/themes'
import { spacing, typography } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { useCountdown } from '@/hooks/useCountdown'
import { formatHMS, countdownTone, type CountdownTone } from '@/lib/countdown'

interface DeadlineCountdownDisplayProps {
  remaining: number | null
  /** Leading label, e.g. "Pay within" / "Seller confirms in". Omit for a bare clock. */
  label?: string
  /** Inline row or prominent deadline banner. */
  size?: 'inline' | 'prominent'
  /** Text shown once the deadline passes. Default "Expired". */
  expiredLabel?: string
}

interface DeadlineCountdownProps extends Omit<DeadlineCountdownDisplayProps, 'remaining'> {
  deadline: Date | string | null
}

/** Foreground colour for the clock digits at each tone. */
function toneFg(theme: AppTheme, tone: CountdownTone, prominent: boolean): string {
  switch (tone) {
    case 'danger':
      return prominent ? theme.colors.feedback.danger.text : theme.colors.feedback.danger.base
    case 'warning':
      return prominent ? theme.colors.feedback.warning.text : theme.colors.feedback.warning.base
    case 'expired':
      return theme.colors.content.tertiary
    default:
      return theme.colors.content.primary
  }
}

/** Banner background + border for the prominent variant at each tone. */
function toneSurface(theme: AppTheme, tone: CountdownTone): { bg: string; border: string } {
  switch (tone) {
    case 'danger':
      return { bg: theme.colors.feedback.danger.surface, border: theme.colors.feedback.danger.border }
    case 'warning':
      return { bg: theme.colors.feedback.warning.surface, border: theme.colors.feedback.warning.border }
    default:
      return { bg: theme.colors.surface.card, border: theme.colors.border.default }
  }
}

/**
 * A once-per-second ticking `H:MM:SS` deadline clock that shifts amber → red as
 * time runs out (see lib/countdown tones). Used for the P2P payment/confirm
 * windows where a live clock conveys urgency a "tomorrow" phrase never could.
 */
export function DeadlineCountdown({
  deadline,
  label,
  size = 'inline',
  expiredLabel = 'Expired',
}: DeadlineCountdownProps) {
  const remaining = useCountdown(deadline)
  return (
    <DeadlineCountdownDisplay
      remaining={remaining}
      label={label}
      size={size}
      expiredLabel={expiredLabel}
    />
  )
}

/** Stateless rendering half for callers that also use remaining time as a permission gate. */
export function DeadlineCountdownDisplay({
  remaining,
  label,
  size = 'inline',
  expiredLabel = 'Expired',
}: DeadlineCountdownDisplayProps) {
  const { theme } = useUnistyles()
  if (remaining === null) return null

  const tone = countdownTone(remaining)
  const prominent = size === 'prominent'
  const fg = toneFg(theme, tone, prominent)
  const clock = tone === 'expired' ? expiredLabel : formatHMS(remaining)

  if (!prominent) {
    return (
      <View
        accessible
        style={s.inline}
        accessibilityLabel={label ? `${label} ${clock}` : clock}
      >
        {label !== undefined && (
          <Text variant="caption" color={theme.colors.content.secondary}>
            {label}
          </Text>
        )}
        <Text style={[s.inlineClock, { color: fg }]}>{clock}</Text>
      </View>
    )
  }

  const surface = toneSurface(theme, tone)
  return (
    <View style={[s.banner, { backgroundColor: surface.bg, borderColor: surface.border }]}>
      {label !== undefined && (
        <Text size={12} weight="semibold" color={fg} style={s.bannerLabel}>
          {label}
        </Text>
      )}
      <Text style={[s.bannerClock, { color: fg }]}>{clock}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: spacing['2xs'],
  },
  inlineClock: {
    fontFamily: typography.fonts.mono,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 4,
  },
  bannerLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bannerClock: {
    fontFamily: typography.fonts.mono,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
})
