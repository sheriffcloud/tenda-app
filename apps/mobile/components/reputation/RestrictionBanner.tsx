import { View, StyleSheet } from 'react-native'
import { ShieldAlert } from 'lucide-react-native'
import { NoticeBanner } from '@/components/ui/NoticeBanner'
import { useMyStanding } from '@/hooks/useStanding'
import { spacing } from '@/theme/tokens'

function formatUntil(iso: string | null): string | null {
  if (iso === null) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Persistent banner for the affected user's own active restriction
 * (stage-7 § UX placements). Renders nothing in good standing. The server
 * guard stays authoritative, this only explains it ahead of time.
 *
 * Draws through the shared `NoticeBanner` — this component was the shape that
 * one was extracted from. It keeps only its own gutter, because it is placed
 * full-bleed by its hosts while the banner itself knows nothing about layout.
 */
export function RestrictionBanner() {
  const standing = useMyStanding()

  const restriction = standing?.restriction ?? null
  if (restriction === null) return null

  const until = formatUntil(restriction.until)
  const headline =
    restriction.kind === 'manual_review'
      ? 'Your account is under review.'
      : until !== null
        ? `Your account is restricted until ${until}.`
        : 'Your account is restricted.'

  return (
    <View style={s.gutter}>
      <NoticeBanner
        tone="warning"
        icon={ShieldAlert}
        title={headline}
        description={`Reason: ${restriction.reason}`}
      />
    </View>
  )
}

const s = StyleSheet.create({
  gutter: { marginHorizontal: spacing.md, marginTop: spacing.sm },
})
