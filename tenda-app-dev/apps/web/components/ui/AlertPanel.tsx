/**
 * A failure said plainly: icon, headline, a sentence, and one way forward.
 *
 * Extracted when a third surface needed it (the public feed, its
 * server-rendered twin, and the gig detail). The ACTION is a slot rather than a
 * prop pair because that is the only thing the call sites disagree about: a
 * client error boundary has a `reset` callback and renders a button, a
 * server-rendered page has no callback and renders a link, and a fresh GET is
 * a real retry there.
 *
 * `role="alert"` so it is announced when it replaces the content a reader was
 * waiting for.
 *
 * No `tone` prop: every use so far is a failure, and a variant nothing asks
 * for is a guess about the next one.
 */
import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

/** Shared by every action inside a panel, so the three cannot drift apart. */
export const ALERT_ACTION_CLASS =
  'mt-5 inline-flex items-center gap-2 rounded-control bg-feedback-danger-base px-4 py-2.5 text-sm font-bold text-content-inverse hover:brightness-95'

export function AlertPanel({
  title,
  body,
  action,
}: {
  title: string
  body: string
  /** The one way forward — a button where a callback exists, a link otherwise. */
  action: ReactNode
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-card border border-feedback-danger-border bg-feedback-danger-surface p-8"
    >
      <AlertTriangle size={22} aria-hidden className="shrink-0 text-feedback-danger-text" />
      <div>
        <h3 className="font-display text-xl font-semibold leading-[26px] text-feedback-danger-text">
          {title}
        </h3>
        <p className="mt-2 max-w-[52ch] text-feedback-danger-text opacity-85">{body}</p>
        {action}
      </div>
    </div>
  )
}
