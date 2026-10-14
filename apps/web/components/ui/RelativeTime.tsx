'use client'

/**
 * A timestamp that keeps telling the truth — "now" for a minute, then "1m",
 * and so on — rather than freezing at whatever it said when the page rendered.
 * See `useLiveRelativeTime` for why the ticking lives outside the component.
 *
 * A `<time>` element, not a `<span>`: the exact instant belongs in the markup
 * whether or not the reader can see it. A relative label is by definition
 * imprecise, and `dateTime` is what a screen reader, a crawler and a
 * copy-paste get instead of the guess. `iso` is passed through untouched — it
 * is already the wire's own ISO-8601 string, so there is no parse here that
 * could throw inside a server render.
 *
 * The only reason this is a client component is the tick. It renders its label
 * in the SSR pass exactly as the plain formatter did, so the public page still
 * works with the bundle disabled — see `useLiveRelativeTime`.
 *
 * It deliberately does NOT carry `suppressHydrationWarning`, and that is a
 * decision rather than an omission. The server writes the HTML at one instant
 * and the browser hydrates at a later one, so a gig 59.8s old when the HTML
 * was written is 60.1s old when the bundle runs and the two passes disagree.
 * MEASURED, both ways:
 *
 *   with the attribute — React keeps the server's text and stops diffing it.
 *     The snapshot React holds is already the NEW label, so no tick re-renders
 *     until the label moves AGAIN: a card reads "now" for a further minute, and
 *     a five-hour-old gig reads "5h" for another hour. That is the exact bug
 *     this component exists to fix, made rarer and silent.
 *   without it — React patches the text, regenerates the client tree, and logs
 *     one development-only hydration warning saying the clock moved. Which is
 *     true.
 *
 * The window is a few hundred milliseconds wide per timestamp, so this is a
 * sub-percent event; the reader always sees the right label. If you are here
 * because that warning appeared in a console, it is not a bug to suppress —
 * React's own text names the fix ("external changing data without sending a
 * snapshot of it along with the HTML"), which would mean threading a
 * server-computed label through every caller, and cannot be done at all for
 * the feed cards that arrive over the WebSocket and are never server-rendered.
 */
import { useLiveRelativeTime } from '@/hooks/timing/useLiveRelativeTime'

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const label = useLiveRelativeTime(iso)
  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  )
}
