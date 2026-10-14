import Link from 'next/link'
import { acceptWindowState, type GigDetail } from '@tenda/shared'
import { buttonVariants } from '@/components/ui'

/**
 * The PUBLIC subset the anonymous CTA reads. Narrow ON PURPOSE: this
 * component's props cross into client-serialized territory, so accepting the
 * full GigDetail invites a caller to serialize party-scoped fields into the
 * anonymous HTML (the exact leak the stage-1 hostile-server e2e guards).
 */
export type PublicGigCta = Pick<GigDetail, 'status' | 'is_assigned' | 'requires_approval' | 'accept_deadline'>

/**
 * Anonymous-reader CTA. The action itself is Stage 4; here the honest offer
 * is "sign in" — worded by `requires_approval` (Apply vs Accept), and only
 * while the gig is actually open to takers.
 */
export function GigDetailCta({ gig }: { gig: PublicGigCta }) {
  if (gig.status !== 'open') {
    return (
      <div className="rounded-card border border-border-default bg-surface-inset px-5 py-4 text-sm text-content-secondary">
        This gig is no longer open — its escrow is {gig.status}.
      </div>
    )
  }
  if (acceptWindowState(gig) === 'closed') {
    return (
      <div className="rounded-card border border-border-default bg-surface-inset px-5 py-4 text-sm text-content-secondary">
        Applications and acceptance have closed for this gig.
      </div>
    )
  }
  if (gig.is_assigned) {
    return (
      <div className="rounded-card border border-border-default bg-surface-inset px-5 py-4 text-sm text-content-secondary">
        The poster has invited someone for this gig directly.
      </div>
    )
  }
  return (
    // `flex-wrap`: the sentence and a `whitespace-nowrap` button cannot both
    // fit one row in the 344px aside on a phone — measured 5px of document
    // overflow on an approval-mode gig, which is the longer of the two
    // wordings. The button keeps its no-wrap; the row gives instead.
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-brand-primary-border bg-brand-primary-surface px-5 py-4">
      <p className="min-w-0 text-sm text-content-secondary">
        {gig.requires_approval
          ? 'The poster picks a worker from applications.'
          : 'First to accept gets the gig.'}
      </p>
      <Link
        href="/signin"
        className={`whitespace-nowrap ${buttonVariants({ size: 'md' })}`}
      >
        {gig.requires_approval ? 'Sign in to apply' : 'Sign in to accept'}
      </Link>
    </div>
  )
}
