/**
 * "There is nothing here" said in the comps' voice: a dashed card, a muted
 * glyph, a headline, one sentence, and at most one way forward.
 *
 * The counterpart to `AlertPanel`, and deliberately a different shape — an
 * empty result is not a failure, and drawing it in danger colours would tell
 * a reader something is broken when their filter simply matched nothing.
 *
 * Extracted at the third caller (the feed's empty result, the feed's past-end
 * state, the exchange's empty book), all three of which the comps draw
 * identically.
 */
import type { ReactNode } from 'react'

export function EmptyPanel({
  icon,
  title,
  body,
  action,
}: {
  /** A muted glyph — pass it already sized; `aria-hidden` is applied here. */
  icon?: ReactNode
  title: string
  body: string
  /** The one way forward, when there is one. */
  action?: ReactNode
}) {
  return (
    <div className="rounded-card border border-dashed border-border-strong px-8 py-14 text-center">
      {icon !== undefined && (
        <span aria-hidden className="mx-auto flex justify-center text-content-tertiary">
          {icon}
        </span>
      )}
      <h3 className="mt-4 font-display text-xl font-semibold leading-[26px] text-content-primary">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-[44ch] text-content-secondary">{body}</p>
      {action}
    </div>
  )
}

/** Shared by every action inside an empty panel, so the callers cannot drift. */
export const EMPTY_ACTION_CLASS =
  'mt-5 inline-block rounded-control bg-brand-solid px-[18px] py-2.5 text-sm font-bold text-brand-on-primary hover:brightness-95 hover:no-underline'
