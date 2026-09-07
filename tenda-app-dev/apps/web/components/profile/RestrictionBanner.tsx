'use client'

/**
 * Persistent banner for the affected user's own active restriction — web
 * twin of mobile's RestrictionBanner. Renders nothing in good standing.
 * The server guard stays authoritative; this only explains it ahead of
 * time.
 */
import { ShieldAlert } from 'lucide-react'
import { useMyStanding } from '@/hooks/profile/useStanding'

function formatUntil(iso: string | null): string | null {
  if (iso === null) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

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
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-card border border-feedback-warning-base/40 bg-feedback-warning-surface p-3.5"
    >
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-feedback-warning-base" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-feedback-warning-text">{headline}</p>
        <p className="text-xs text-feedback-warning-text/90">Reason: {restriction.reason}</p>
      </div>
    </div>
  )
}
