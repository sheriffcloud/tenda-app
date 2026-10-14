/**
 * The dossier's Record section (Tier 2 comp, lines 543-566): a linear spine
 * with a terminal branch.
 *
 * The SHAPE comes from shared `buildEscrowTimeline` — which statuses are
 * progress and which are a branch is domain truth, not layout. This component
 * only draws it.
 *
 * Rendered as an <ol>: the steps are ordered and a screen reader should say
 * so. Each step's state is in its text, not only its colour, so the timeline
 * survives being read aloud or seen without colour.
 */
import { formatRelativeDayWithTime, buildEscrowTimeline, STATUS_LABEL, type EscrowTimelineInput } from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { cn } from '@/lib/cn'
import { STATE_TIMELINE_COPY, timelineBranchCopy } from './copy'

const DOT_BY_STATE = {
  done: 'bg-feedback-success-base',
  current: 'bg-brand-primary ring-4 ring-brand-focus-ring',
  upcoming: 'border-2 border-border-default bg-transparent',
} as const

export function StateTimeline({
  escrow,
  formatStamp = formatRelativeDayWithTime,
}: {
  escrow: EscrowTimelineInput
  /**
   * Renders an ISO stamp. Defaults to the shared formatter rather than to the
   * RAW value: a default that prints `2026-08-16T10:00:00.000Z` at a reader is
   * one every caller has to remember to override, and the first one that
   * forgot shipped it (the workspace dossier, #17 review).
   */
  formatStamp?: (iso: string) => string
}) {
  const { spine, branch } = buildEscrowTimeline(escrow)

  return (
    <section className="mt-9">
      <Eyebrow as="h3" className="mb-5">
        {STATE_TIMELINE_COPY.heading}
      </Eyebrow>

      <ol className="list-none p-0">
        {spine.map((node, index) => {
          const reached = node.state !== 'upcoming'
          const nextReached = spine[index + 1]?.state !== 'upcoming'
          return (
            <li key={node.status} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-4 pb-5">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full', DOT_BY_STATE[node.state])}
                />
                {index < spine.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1 min-h-[22px] w-0.5 flex-1',
                      nextReached ? 'bg-feedback-success-base' : 'bg-border-default',
                    )}
                  />
                )}
              </div>
              <div className="pt-px">
                <p
                  className={cn(
                    'font-display type-title',
                    reached ? 'text-content-primary' : 'text-content-tertiary',
                  )}
                >
                  {STATUS_LABEL[node.status]}
                  {/* State in TEXT, not only colour — a dot colour says
                      nothing when read aloud. */}
                  <span className="sr-only">{` — ${STATE_TIMELINE_COPY.state[node.state]}`}</span>
                </p>
                <p className="mt-0.5 max-w-[56ch] type-body-small text-content-secondary">
                  {STATE_TIMELINE_COPY.body[node.status]}
                </p>
                {node.stamp !== null && (
                  <p className="mt-1 font-numeric text-xs leading-4 text-content-tertiary">
                    {formatStamp(node.stamp)}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {branch !== null && (
        <div
          role="note"
          className="ml-10 mt-1 rounded-card border border-feedback-warning-border border-l-[3px] border-l-feedback-warning-base bg-feedback-warning-surface px-4.5 py-4"
        >
          <Eyebrow strong tone="warning">
            {STATUS_LABEL[branch]}
          </Eyebrow>
          <p className="mt-1.5 max-w-[56ch] type-body-small text-feedback-warning-text">
            {timelineBranchCopy(branch)}
          </p>
        </div>
      )}
    </section>
  )
}
