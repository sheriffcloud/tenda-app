'use client'

/**
 * The poster's shortlist — web port of mobile's ApplicantList + ApplicantRow
 * over the SHARED copy. The countdown is decision-relevant, not decoration:
 * an application that lapses stops being assignable, and without the clock
 * the poster would pay gas to discover that.
 */
import {
  APPLICANTS_EMPTY,
  APPLICANT_REVIEW_GUIDANCE,
  applicantStatusLine,
  formatFullName,
  type GigApplicant,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { useNow } from '@/hooks/timing/useNow'
import type { ApplicantFilter } from '@/hooks/gig/useApplications'

function ApplicantRow({
  applicant,
  assignable,
  busy,
  onAssign,
}: {
  applicant: GigApplicant
  /** Whether the gig can still be assigned at all (one shared rule). */
  assignable: boolean
  /** True while ANY assignment is in flight — two rows must not both fire. */
  busy: boolean
  onAssign: (applicant: GigApplicant) => void
}) {
  const now = useNow()
  const name = formatFullName(applicant.first_name, applicant.last_name) || 'Anonymous'
  const isOpen = applicant.status === 'open'
  const expiresAt = applicant.expires_at !== null ? new Date(applicant.expires_at) : null
  const isApplicationAssignable =
    isOpen && expiresAt !== null && expiresAt.getTime() > now

  return (
    <li className="flex flex-col gap-2 rounded-card border border-border-default bg-surface-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-content-primary">{name}</p>
        {applicant.review_score !== null && (
          <span className="shrink-0 text-xs text-content-secondary">★ {applicant.review_score}</span>
        )}
      </div>
      {applicant.message !== null && (
        <p className="text-sm text-content-secondary">{applicant.message}</p>
      )}
      <p className="text-xs text-content-tertiary">
        {applicantStatusLine(applicant.status)}
        {isApplicationAssignable && expiresAt !== null && ` · assignable until ${expiresAt.toLocaleString()}`}
      </p>
      {assignable && isApplicationAssignable && (
        <Button size="md" disabled={busy} onClick={() => onAssign(applicant)}>
          {busy ? 'Working…' : 'Assign this worker'}
        </Button>
      )}
    </li>
  )
}

export function ApplicantList({
  applicants,
  error,
  filter,
  onFilterChange,
  assignable,
  busy,
  onAssign,
  onRetry,
}: {
  applicants: GigApplicant[] | null
  error: string | null
  filter: ApplicantFilter
  onFilterChange: (filter: ApplicantFilter) => void
  assignable: boolean
  busy: boolean
  onAssign: (applicant: GigApplicant) => void
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-content-secondary">{APPLICANT_REVIEW_GUIDANCE}</p>
      <div className="flex gap-2">
        <Chip label="Waiting" selected={filter === 'open'} onClick={() => onFilterChange('open')} />
        <Chip label="All" selected={filter === 'all'} onClick={() => onFilterChange('all')} />
      </div>

      {error !== null && (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-sm text-content-secondary">{error}</p>
          <Button variant="outline" size="md" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      {error === null && applicants === null && (
        <p className="py-8 text-center text-sm text-content-secondary">Loading…</p>
      )}

      {error === null && applicants !== null && applicants.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm font-semibold text-content-primary">
            {APPLICANTS_EMPTY[filter].title}
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            {APPLICANTS_EMPTY[filter].description}
          </p>
        </div>
      )}

      {error === null && applicants !== null && applicants.length > 0 && (
        <ul className="flex flex-col gap-3">
          {applicants.map((applicant) => (
            <ApplicantRow
              key={applicant.id}
              applicant={applicant}
              assignable={assignable}
              busy={busy}
              onAssign={onAssign}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
