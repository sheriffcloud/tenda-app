/**
 * A bordered, tinted strip that tells the user something about the screen they
 * are on — not about something they just did (that is `showToast`) and not
 * something they must answer (that is `ConfirmDialog`).
 *
 * Extracted because the same icon + headline + body + feedback-tone box had
 * been hand-rolled per feature, and the copies had already drifted in padding
 * and radius. `DraftsBanner` and `NotificationNudgeBanner` are deliberately NOT
 * folded in: both are pressables carrying their own affordances (a chevron, a
 * dismiss), so they are different components that happen to look similar.
 *
 * The tone maps straight onto `theme.colors.feedback`, so a banner cannot
 * invent a colour that is not already in the palette.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { LucideIcon } from 'lucide-react-native'
import { spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'

export type NoticeTone = 'success' | 'warning' | 'danger' | 'info'

interface NoticeBannerProps {
  tone: NoticeTone
  icon: LucideIcon
  title: string
  /**
   * Optional second line. A plain string, deliberately — every caller has one,
   * and a `ReactNode` body would need a runtime branch to know whether to wrap
   * it in a `<Text>` (RN throws on a bare string outside one). If a banner ever
   * needs a link inside it, widen this then.
   */
  description?: string
}

const ICON_SIZE = 18

export function NoticeBanner({ tone, icon: Icon, title, description }: NoticeBannerProps) {
  const { theme } = useUnistyles()
  const palette = theme.colors.feedback[tone]

  return (
    <View
      // `accessible` as well as the role: without it RN does not expose the
      // container as an accessibility element at all, so the role is inert and
      // the banner is read as loose fragments rather than one announcement.
      accessible
      accessibilityRole="alert"
      style={[s.banner, { backgroundColor: palette.surface, borderColor: palette.base }]}
    >
      <Icon size={ICON_SIZE} color={palette.base} />
      <View style={s.body}>
        <Text size={13} weight="semibold" color={palette.base}>
          {title}
        </Text>
        {description !== undefined && (
          <Text size={12} color={theme.colors.content.secondary} style={s.detail}>
            {description}
          </Text>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    // 14, not `radius.md` (16). This was `radius.md` briefly and that was a
    // silent visual change: the banner it was extracted from used 14, and so do
    // ~8 sibling card surfaces (wallet rows, proofs grid, payment input,
    // deadline countdown). The token scale has no 14, so those are all raw —
    // whether the scale should grow a 14 or those surfaces should move to 16 is
    // a design-system decision, and a refactor is the wrong place to make it by
    // accident.
    borderRadius: 14,
    padding: spacing.sm,
  },
  body: { flex: 1, gap: 2 },
  detail: { lineHeight: 16 },
})
