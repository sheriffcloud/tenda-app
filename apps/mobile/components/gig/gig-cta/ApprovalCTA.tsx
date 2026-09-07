/**
 * Draws ONE approval-mode branch. Which branch applies is decided by the pure
 * `approvalBranch`; where it sits is decided by `assignSlots`.
 */
import { View, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { acceptWindowState, unassignWindowEndsAt, type GigDetail } from '@tenda/shared'
import { spacing, radius } from '@/theme/tokens'
import { Button } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { ExpandableNotice } from '@/components/ui/information'
import {
  DeadlineCountdown,
  DeadlineCountdownDisplay,
} from '@/components/shared/DeadlineCountdown'
import { useCountdown } from '@/hooks/useCountdown'
import {
  applicantsCtaLabel,
  APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL,
  applicationStatusLine,
  openApplicationLine,
  UNASSIGN_WINDOW_INFORMATION,
} from '@/components/gig/gig-applications/copy'
import { approvalContextOf } from './parties'
import type { ApprovalBranch } from './branches'
import { widthProps, type CtaWidth } from './slots'

/**
 * What this CTA can raise. `unassign` is the only one that ends in a wallet —
 * the screen routes it to the transaction gate — but it travels the same
 * channel so the bar has ONE callback and cannot wire a branch to the wrong one.
 */
export type ApprovalAction = 'apply' | 'withdraw' | 'release' | 'viewApplicants' | 'unassign'

interface Props {
  branch: ApprovalBranch
  gig: GigDetail
  busy: boolean
  width: CtaWidth
  onAction: (action: ApprovalAction) => void
}

export function ApprovalCTA({ branch, gig, busy, width, onAction }: Props) {
  const { theme } = useUnistyles()
  const application = gig.viewer?.application ?? null
  const releaseWindowEndsAt = branch === 'unassign'
    ? unassignWindowEndsAt(approvalContextOf(gig))
    : null
  const releaseTimeRemaining = useCountdown(releaseWindowEndsAt)
  // Only the single-button branches take `width`. `unassign`, `withdraw` and
  // `apply` are stacks of notices, a button and a countdown — they cannot
  // share a row and are slotted `primary`, where nothing else can sit.
  const shared = widthProps(width)

  switch (branch) {
    case 'assign':
      return (
        <Button {...shared} variant="primary" onPress={() => onAction('viewApplicants')}>
          {applicantsCtaLabel(gig.viewer?.open_application_count ?? null)}
        </Button>
      )

    case 'unassign': {
      // The branch is selected when the parent renders. Keep the action honest
      // if its window closes while this screen remains mounted.
      if (releaseTimeRemaining === null || releaseTimeRemaining <= 0) return null
      // Held in a const so the `!== 'open'` guard below narrows it — the
      // warning map has no `open` key, and rightly so: there is nothing to
      // warn about while there is still room to assign someone else.
      const acceptWindow = acceptWindowState(gig)
      return (
        <View style={s.stack}>
          {gig.assignment_released_at !== null && (
            <View style={[s.notice, { backgroundColor: theme.colors.feedback.warning.surface }]}>
              <Text variant="caption" color={theme.colors.feedback.warning.base} weight="semibold" align="center">
                Your worker said they are not available.
              </Text>
            </View>
          )}
          {/*
            Critical assessment #3: `accept_deadline` does NOT extend across
            assign/unassign cycles, so a poster cycling workers can run the
            clock out and lose the gig to the refund path. Warned on the time
            actually left rather than on how many times they have done it —
            the remaining window is what decides the outcome, and whether it is
            merely short or already gone decides which warning is true.
          */}
          {acceptWindow !== 'open' && (
            <ExpandableNotice content={UNASSIGN_WINDOW_INFORMATION[acceptWindow]} />
          )}
          <View style={[s.assignmentControl, { backgroundColor: theme.colors.surface.inset }]}>
            <Text weight="semibold">Change worker</Text>
            <Text variant="caption" color={theme.colors.content.secondary}>
              Release this assignment to reopen the gig for another worker.
            </Text>
            {/* This deadline belongs to the release action, so it stays in the
                same card and names that action explicitly. */}
            <DeadlineCountdownDisplay
              remaining={releaseTimeRemaining}
              label="Time left to release assignment"
              expiredLabel="Release window closed"
            />
            <Button variant="outline" size="xl" fullWidth loading={busy} onPress={() => onAction('unassign')}>
              Release assignment
            </Button>
          </View>
        </View>
      )
    }

    case 'release':
      return (
        <Button {...shared} variant="outline" loading={busy} onPress={() => onAction('release')}>
          I&apos;m not available
        </Button>
      )

    case 'withdraw':
      return (
        <View style={s.stack}>
          <View style={[s.notice, { backgroundColor: theme.colors.surface.inset }]}>
            <Text variant="caption" color={theme.colors.content.secondary} align="center">
              {openApplicationLine(gig)}
            </Text>
            <DeadlineCountdown
              deadline={application?.expires_at ?? null}
              label={APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL}
              expiredLabel="Application expired"
            />
          </View>
          <Button variant="outline" size="xl" fullWidth loading={busy} onPress={() => onAction('withdraw')}>
            Withdraw application
          </Button>
        </View>
      )

    case 'apply':
      return (
        <View style={s.stack}>
          {application !== null && (
            <Text variant="caption" color={theme.colors.content.tertiary} align="center">
              {applicationStatusLine(application.status, null)}
            </Text>
          )}
          <Button variant="primary" size="xl" fullWidth loading={busy} onPress={() => onAction('apply')}>
            Apply for this gig
          </Button>
        </View>
      )

    case 'lost':
      // `approvalBranch` only produces this with an application in hand, but
      // the type cannot say so. Rendering nothing beats rendering the empty
      // grey box an unguarded `''` would leave behind.
      if (application === null) return null
      return (
        <View style={[s.notice, { backgroundColor: theme.colors.surface.inset }]}>
          <Text variant="caption" color={theme.colors.content.secondary} align="center">
            {applicationStatusLine(application.status, null)}
          </Text>
        </View>
      )
  }
}

const s = StyleSheet.create({
  stack: { gap: spacing.xs },
  notice: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
  assignmentControl: { padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
})
