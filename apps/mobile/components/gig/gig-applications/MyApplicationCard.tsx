/**
 * One row of the applicant's own list: the gig they applied to, plus what has
 * become of the application.
 *
 * The gig itself renders through the SAME `GigCardCompact` every other gig
 * surface uses — which is why the server nests a plain `GigSummary` here
 * rather than flattening it. The application status rides above it, because
 * "did I win?" is the question this screen exists to answer and it is not
 * answerable from the gig alone.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import type { MyApplication } from '@tenda/shared'
import { spacing } from '@/theme/tokens'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { DeadlineCountdown } from '@/components/shared/DeadlineCountdown'
import { GigCardCompact } from '@/components/gig/GigCardCompact'
import {
  APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL,
  applicationStatusLine,
  openApplicationLine,
} from './copy'

interface Props {
  row: MyApplication
  busy: boolean
  onWithdraw: (row: MyApplication) => void
}

export function MyApplicationCard({ row, busy, onWithdraw }: Props) {
  const { theme } = useUnistyles()
  const isOpen = row.application.status === 'open'

  return (
    <View style={s.wrap}>
      <GigCardCompact gig={row.gig} showStatus />
      <View style={s.footer}>
        <View style={s.status}>
          <Text variant="caption" color={theme.colors.content.secondary}>
            {/* Same rule as the gig detail's withdraw box: an open row on a gig
                that is no longer open is not "waiting on the poster". */}
            {isOpen
              ? openApplicationLine(row.gig)
              : applicationStatusLine(row.application.status, null)}
          </Text>
          {/* D5: the applicant is responsible for their own availability, so
              the time left on their application is theirs to watch. */}
          {isOpen && (
            <DeadlineCountdown
              deadline={row.application.expires_at}
              label={APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL}
              expiredLabel="Application expired"
            />
          )}
        </View>
        {isOpen && (
          <Button variant="outline" size="sm" loading={busy} onPress={() => onWithdraw(row)}>
            Withdraw
          </Button>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  status: { flex: 1, gap: 2 },
})
