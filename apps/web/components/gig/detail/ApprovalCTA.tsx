'use client'

/**
 * Draws ONE approval-mode branch — web twin of mobile's ApprovalCTA over the
 * SHARED rules + copy. Countdown displays are simplified to deadline text
 * (mobile's live tick arrives with S5.4's live-refresh work); every rule and
 * sentence is the shared one.
 */
import {
  acceptWindowState,
  approvalContextOf,
  unassignWindowEndsAt,
  applicantsCtaLabel,
  applicationStatusLine,
  openApplicationLine,
  UNASSIGN_WINDOW_INFORMATION,
  type ApprovalBranch,
  type CtaWidth,
  type GigDetail,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { useNow } from '@/hooks/timing/useNow'
import { widthClass } from './width'

/**
 * What this CTA can raise. `unassign` is the only one that ends in a wallet —
 * the screen routes it to the transaction gate — but it travels the same
 * channel so the bar has ONE callback.
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
  const now = useNow()
  const application = gig.viewer?.application ?? null
  const w = widthClass(width)
  const busyLabel = (label: string) => (busy ? 'Working…' : label)

  switch (branch) {
    case 'assign':
      return (
        <Button size="lg" className={w} onClick={() => onAction('viewApplicants')}>
          {applicantsCtaLabel(gig.viewer?.open_application_count ?? null)}
        </Button>
      )

    case 'unassign': {
      // Keep the action honest if its window closes while the screen stays
      // mounted.
      const endsAt = unassignWindowEndsAt(approvalContextOf(gig))
      if (endsAt === null || endsAt.getTime() <= now) return null
      const acceptWindow = acceptWindowState(gig)
      return (
        <div className="flex flex-col gap-2">
          {gig.assignment_released_at !== null && (
            <p className="rounded-control bg-feedback-warning-surface px-3 py-2 text-center text-xs font-semibold text-feedback-warning-base">
              Your worker said they are not available.
            </p>
          )}
          {acceptWindow !== 'open' && (
            <p className="rounded-control bg-feedback-warning-surface px-3 py-2 text-xs text-content-secondary">
              <span className="font-semibold text-feedback-warning-base">
                {UNASSIGN_WINDOW_INFORMATION[acceptWindow].title}.{' '}
              </span>
              {UNASSIGN_WINDOW_INFORMATION[acceptWindow].description}
            </p>
          )}
          <div className="flex flex-col gap-2 rounded-card bg-surface-inset p-4">
            <p className="text-sm font-semibold text-content-primary">Change worker</p>
            <p className="text-xs text-content-secondary">
              Release this assignment to reopen the gig for another worker. Window closes{' '}
              {endsAt.toLocaleString()}.
            </p>
            <Button variant="outline" size="lg" fullWidth disabled={busy} onClick={() => onAction('unassign')}>
              {busyLabel('Release assignment')}
            </Button>
          </div>
        </div>
      )
    }

    case 'release':
      return (
        <Button variant="outline" size="lg" className={w} disabled={busy} onClick={() => onAction('release')}>
          {busyLabel("I'm not available")}
        </Button>
      )

    case 'withdraw':
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded-control bg-surface-inset px-3 py-2 text-center text-xs text-content-secondary">
            {openApplicationLine(gig)}
            {application?.expires_at != null &&
              ` · expires ${new Date(application.expires_at).toLocaleString()}`}
          </p>
          <Button variant="outline" size="lg" fullWidth disabled={busy} onClick={() => onAction('withdraw')}>
            {busyLabel('Withdraw application')}
          </Button>
        </div>
      )

    case 'apply':
      return (
        <div className="flex flex-col gap-2">
          {application !== null && (
            <p className="text-center text-xs text-content-tertiary">
              {applicationStatusLine(application.status, null)}
            </p>
          )}
          <Button size="lg" fullWidth disabled={busy} onClick={() => onAction('apply')}>
            {busyLabel('Apply for this gig')}
          </Button>
        </div>
      )

    case 'lost':
      // Rendering nothing beats rendering an empty grey box.
      if (application === null) return null
      return (
        <p className="rounded-control bg-surface-inset px-3 py-2 text-center text-xs text-content-secondary">
          {applicationStatusLine(application.status, null)}
        </p>
      )
  }
}
