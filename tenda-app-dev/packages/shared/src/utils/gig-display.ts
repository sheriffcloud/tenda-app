/**
 * Display helpers for gig escrows, shared by mobile and web (moved from
 * apps/mobile/lib/gig-display.ts 2026-08-15; only statusDotColor stayed
 * behind — it takes the mobile AppTheme):
 *   - Date / duration / deadline formatters
 *   - Status label + status-tone mappings (single source of truth used by
 *     GigStatusBadge, GigCardCompact (Rich/PriceLeading/Classic), and any
 *     other surface that needs to display an escrow status)
 *
 * Post-#34 these key off the v2 EscrowStatus vocabulary: there is no
 * 'expired' status, an expired-open escrow becomes 'refunded' once the
 * creator reclaims, and the deadline chip derives "Expired" from the
 * accept_deadline. Deadlines come straight off the escrow row
 * (completion_deadline / approval_deadline are stored, not derived).
 *
 * Locale formatting is frontend-only; pure logic belongs in
 * @tenda/shared/utils/gig-utils.
 */
import type { EscrowStatus } from '../types/escrow'
import { formatRelativeShort } from './date'
import { LOCATIONS, isCountryCode } from '../constants/locations'

/** Threshold below which a deadline chip switches to the urgent (warn) tone. */
export const URGENT_HOURS = 2

export const STATUS_LABEL: Record<EscrowStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  accepted: 'Accepted',
  submitted: 'Submitted',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  disputed: 'Disputed',
  resolved: 'Resolved',
}

/** Tone slot for the Badge primitive (`<Badge variant={...} />`). */
export const STATUS_BADGE_VARIANT: Record<
  EscrowStatus,
  'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent' | 'neutral'
> = {
  draft: 'neutral',
  open: 'success',
  accepted: 'brand',
  submitted: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  refunded: 'neutral',
  disputed: 'danger',
  resolved: 'success',
}

export function deadlineLabel(deadline: Date | null): string {
  if (!deadline) return ''

  const now = new Date()
  const diffMs = deadline.getTime() - now.getTime()
  if (diffMs <= 0) return 'Expired'

  // Under a day out, surface hours/minutes so urgency is legible
  // ("4h left" / "45m left") instead of a flat "Tomorrow".
  if (diffMs < 86_400_000) return `${formatCountdown(diffMs)} left`

  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays === 1) return 'Tomorrow'
  return `${diffDays} days left`
}

/**
 * Format a positive ms duration as a compact countdown:
 *   45m · 1h 10m · 4h · 22h · 3d
 */
function formatCountdown(ms: number): string {
  if (ms <= 0) return ''
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) {
    const remMin = Math.floor((ms - hours * 3_600_000) / 60_000)
    if (hours < 2 && remMin > 0) return `${hours}h ${remMin}m`
    return `${hours}h`
  }
  const days = Math.floor(ms / 86_400_000)
  return `${days}d`
}

export type GigDeadlineGlyph = 'clock' | 'check' | null
export type GigDeadlineTone = 'neutral' | 'urgent' | 'success'

export interface GigDeadlineMeta {
  /** Human label for the chip (e.g. "45m left", "22h to review", "Draft", "3d ago"). */
  label: string
  /** Leading glyph hint (consumer renders the matching lucide icon). */
  glyph: GigDeadlineGlyph
  /** Visual tone, drives chip background + foreground. */
  tone: GigDeadlineTone
}

/** Minimal escrow shape the chip needs, wire strings and Dates both work. */
export interface GigDeadlineSource {
  status: EscrowStatus
  accept_deadline: string | Date | null
  /** Stored on the escrow at accept (v2), null while open/draft. */
  completion_deadline?: string | Date | null
  /** Stored on the escrow at submit (v2), the poster's review window. */
  approval_deadline?: string | Date | null
  /** Used for the "3d ago" chip on completed/resolved rows. */
  updated_at?: string | Date | null
}

/**
 * Resolve the deadline-chip presentation for an escrow in any status.
 * Single source of truth used by GigCardCompact (Rich/PriceLeading/Classic).
 *
 *   open      → "45m left" / "4h left" (urgent < {@link URGENT_HOURS}; "Expired" past deadline)
 *   accepted  → "1h 10m" / "Xh"        (completion_deadline countdown)
 *   submitted → "22h to review"        (approval_deadline countdown)
 *   draft     → "Draft"                (no countdown, neutral chip)
 *   refunded  → "Refunded"             (neutral)
 *   completed → "3d ago"               (success, check glyph, relative past)
 *   resolved  → "3d ago"               (success, like completed)
 *   disputed  → "Support open"         (neutral chip)
 *   cancelled → "Cancelled"             (neutral, no glyph)
 *
 * A status this build does not know returns the same empty/neutral meta as a
 * missing deadline, so an old install meeting a newer server shows no chip
 * rather than crashing — see the `default` arm.
 */
export function gigDeadlineMeta(gig: GigDeadlineSource): GigDeadlineMeta {
  const now = Date.now()

  switch (gig.status) {
    case 'draft':
      return { label: 'Draft', glyph: 'clock', tone: 'neutral' }

    case 'refunded':
      return { label: 'Refunded', glyph: 'clock', tone: 'neutral' }

    case 'cancelled':
      return { label: 'Cancelled', glyph: null, tone: 'neutral' }

    case 'disputed':
      return { label: 'Support open', glyph: 'clock', tone: 'neutral' }

    case 'completed':
    case 'resolved': {
      const closedAt = gig.updated_at ? new Date(gig.updated_at) : null
      const ago = closedAt ? formatRelativeShort(closedAt) : ''
      return { label: ago, glyph: 'check', tone: 'success' }
    }

    case 'open': {
      if (!gig.accept_deadline) return { label: '', glyph: null, tone: 'neutral' }
      const deadline = new Date(gig.accept_deadline)
      const diffMs = deadline.getTime() - now
      if (diffMs <= 0) return { label: 'Expired', glyph: 'clock', tone: 'neutral' }
      const urgent = diffMs / 3_600_000 < URGENT_HOURS
      return {
        label: `${formatCountdown(diffMs)} left`,
        glyph: 'clock',
        tone: urgent ? 'urgent' : 'neutral',
      }
    }

    case 'accepted': {
      if (!gig.completion_deadline) return { label: '', glyph: null, tone: 'neutral' }
      const diffMs = new Date(gig.completion_deadline).getTime() - now
      if (diffMs <= 0) return { label: 'Overdue', glyph: 'clock', tone: 'urgent' }
      const urgent = diffMs / 3_600_000 < URGENT_HOURS
      return { label: formatCountdown(diffMs), glyph: 'clock', tone: urgent ? 'urgent' : 'neutral' }
    }

    case 'submitted': {
      if (!gig.approval_deadline) return { label: '', glyph: null, tone: 'neutral' }
      const diffMs = new Date(gig.approval_deadline).getTime() - now
      if (diffMs <= 0) return { label: 'Review overdue', glyph: 'clock', tone: 'urgent' }
      const urgent = diffMs / 3_600_000 < URGENT_HOURS
      return {
        label: `${formatCountdown(diffMs)} to review`,
        glyph: 'clock',
        tone: urgent ? 'urgent' : 'neutral',
      }
    }

    default: {
      /**
       * Unreachable per the type, reachable in practice: `status` is whatever
       * the server sent, and an installed client outlives the vocabulary it
       * was built with. Without this the switch fell through, returned
       * `undefined`, and every caller threw on `.label` — which in a list row
       * is a blank screen, not a missing chip.
       *
       * The `never` binding keeps the COMPILE-TIME guarantee that a status
       * added to `EscrowStatus` must be handled above: if one is, `status` is
       * no longer `never` here and this line fails to build. A bare `default`
       * would have silently swallowed it.
       */
      const unhandled: never = gig.status
      void unhandled
      return { label: '', glyph: null, tone: 'neutral' }
    }
  }
}

/** Format a date for display (weekday + day + month + year). */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Format a completion duration in seconds to a short human-readable string.
 * e.g. 3600 → "1h", 86400 → "1d", 90 → "2m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

/**
 * Format an accept_deadline for display.
 * Shows a time component (HH:MM) when the deadline is less than 24 hours away,
 * so users have the urgency context they need to act quickly.
 */
export function formatDeadline(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const hoursUntil = (d.getTime() - Date.now()) / 3_600_000
  if (hoursUntil < 24) {
    return d.toLocaleString('en-NG', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return d.toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** The location fields every gig surface reads to say WHERE the work is. */
export interface GigPlace {
  remote: boolean
  city: string | null
  country: string | null
}

/** Shown when a physical gig carries no location at all — unknown, not "anywhere". */
export const PLACE_UNKNOWN = '—'

/**
 * Where the work happens, as one line: 'Remote', or 'Lagos, Nigeria'.
 *
 * The country arrives as an ISO code and is resolved to its NAME here. Four
 * surfaces wrote four rules for this — one printed the bare 'NG', one fell
 * back to the word "Anywhere" (a claim: a gig with no location is unknown,
 * not open to everyone), one to an empty string — so the same gig described
 * its own location differently on the card, the detail page and the link
 * preview that got pasted into a chat.
 *
 * Remote gigs persist no country or city at all, which is why remote is
 * answered first rather than joined with them.
 */
export function gigPlaceLabel(gig: GigPlace): string {
  if (gig.remote) return 'Remote'
  const code = gig.country
  // isCountryCode rather than a cast: an unknown code is shown as-is, which is
  // still more use to a reader than dropping the country entirely.
  const country = code === null || code === '' ? null : isCountryCode(code) ? LOCATIONS[code].name : code
  const parts = [gig.city, country].filter((part): part is string => part !== null && part !== '')
  return parts.length === 0 ? PLACE_UNKNOWN : parts.join(', ')
}
