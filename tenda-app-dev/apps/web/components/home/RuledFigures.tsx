'use client'

/**
 * The four ruled figures (#60): posted, active, completed and the review
 * score with its denominator — `useProfileStats`, the same server COUNTs the
 * profile shows, never a capped page reduced client-side. `status` decides
 * what the cells may claim: only `ready` prints numbers; a failed read says
 * so and offers the retry, rather than four confident zeros.
 */
import { formatReviewScore } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { ProfileStats } from '@/hooks/profile/useProfileStats'
import { HOME_COPY } from './copy'

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-r border-border-subtle pr-5 last:border-r-0 [&+&]:pl-5 max-sm:border-r-0 max-sm:[&+&]:pl-0">
      <span className="type-mono-large text-content-primary">{children}</span>
      <Eyebrow as="span">{label}</Eyebrow>
    </div>
  )
}

export function RuledFigures({ stats, reviewScore }: { stats: ProfileStats; reviewScore: string | null }) {
  const score = formatReviewScore(reviewScore)
  if (stats.status === 'error') {
    return (
      <div className="mt-7 flex items-center gap-3 border-t border-border-default pt-5 type-body-small text-content-tertiary">
        <span>{HOME_COPY.figures.unavailable}</span>
        <button type="button" onClick={stats.reload} className="font-semibold text-content-link">
          {HOME_COPY.figures.retry}
        </button>
      </div>
    )
  }
  const ready = stats.status === 'ready'
  const placeholder = <span aria-hidden className="inline-block h-8 w-12 animate-shimmer rounded-xs bg-surface-inset" />
  return (
    <div
      data-figures
      aria-busy={!ready}
      className="mt-7 grid grid-cols-2 gap-y-5 border-t border-border-default pt-[22px] sm:grid-cols-4"
    >
      <Figure label={HOME_COPY.figures.posted}>{ready ? stats.posted : placeholder}</Figure>
      <Figure label={HOME_COPY.figures.active}>{ready ? stats.active : placeholder}</Figure>
      <Figure label={HOME_COPY.figures.completed}>{ready ? stats.completed : placeholder}</Figure>
      <Figure label={HOME_COPY.figures.score}>
        {ready ? (
          <>
            {score ?? HOME_COPY.figures.unrated}
            <span className="ml-1.5 font-numeric text-xs font-medium leading-4 tracking-normal text-content-tertiary">
              {HOME_COPY.figures.reviews(stats.reviews)}
            </span>
          </>
        ) : (
          placeholder
        )}
      </Figure>
    </div>
  )
}
