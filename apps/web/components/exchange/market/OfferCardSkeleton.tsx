/**
 * The order book's loading state (Tier-3 comp, lines 415-425): five card
 * outlines shimmering at the size the real rows will be, rather than a
 * centred spinner that says only "wait".
 *
 * `aria-hidden` and no live region: there is nothing here to read, and the
 * rows announce themselves when they land.
 */
const ROWS = 5

export function OfferCardSkeleton({ rows = ROWS }: { rows?: number }) {
  return (
    <div aria-hidden className="flex animate-shimmer flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-card border border-border-subtle bg-surface-card p-5"
        >
          <div className="h-3.5 w-[22%] rounded-md bg-surface-inset" />
          <div className="mt-3.5 h-7 w-[36%] rounded-md bg-surface-inset" />
          <div className="mt-4 h-3 w-[60%] rounded-md bg-surface-inset" />
        </div>
      ))}
    </div>
  )
}
