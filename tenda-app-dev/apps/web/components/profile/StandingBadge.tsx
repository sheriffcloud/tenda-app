'use client'

/**
 * Inline standing chip — web twin of mobile's StandingBadge: completion %
 * (or "New user") plus a "Limited" marker for publicly visible
 * restrictions. Renders nothing until standing loads — decorative, never
 * blocking. The breakdown expands inline (mobile's sheet).
 */
import { useState } from 'react'
import { useUserStanding } from '@/hooks/profile/useStanding'

export function StandingBadge({ userId }: { userId: string }) {
  const standing = useUserStanding(userId)
  const [open, setOpen] = useState(false)

  if (standing === null) return null

  const label =
    standing.completion_rate !== null
      ? `${Math.round(standing.completion_rate * 100)}% completion`
      : 'New user'

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Standing: ${label}${standing.is_limited ? ', limited account' : ''}`}
        className="flex items-center gap-1 rounded-full bg-surface-inset px-2.5 py-1 text-[11.5px] text-content-secondary transition-opacity hover:opacity-80"
      >
        {label}
        {standing.is_limited && (
          <span className="font-semibold text-feedback-warning-base">· Limited</span>
        )}
      </button>
      {open && (
        <dl className="flex gap-4 rounded-control bg-surface-inset px-3 py-2 text-xs text-content-secondary">
          <div>
            <dt className="text-content-tertiary">Completed</dt>
            <dd className="font-numeric font-semibold text-content-primary">{standing.completed_count}</dd>
          </div>
          <div>
            <dt className="text-content-tertiary">Rating</dt>
            <dd className="font-numeric font-semibold text-content-primary">
              {standing.review_score !== null ? Number(standing.review_score).toFixed(1) : '—'}
            </dd>
          </div>
          {standing.member_since !== null && (
            <div>
              <dt className="text-content-tertiary">Member since</dt>
              <dd className="font-numeric font-semibold text-content-primary">
                {new Date(standing.member_since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
