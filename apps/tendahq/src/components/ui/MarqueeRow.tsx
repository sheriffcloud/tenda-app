import type { ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface Props<T> {
  items: readonly T[]
  /** Render one item. Caller controls width. */
  renderItem: (item: T, index: number) => ReactNode
  /** Loop duration in seconds. */
  speedSec: number
  direction: 'left' | 'right'
  /** Stable React key off this item field. */
  keyOf: (item: T) => string
}

/**
 * Infinite horizontal marquee. Renders items twice (visually identical) and
 * animates a -50% translate so the seam is invisible; pauses on hover.
 * Reduced-motion users get a static, scrollable row.
 */
export function MarqueeRow<T>({ items, renderItem, speedSec, direction, keyOf }: Props<T>) {
  const reduced = useReducedMotion()
  const animationName = direction === 'left' ? 'marquee-x' : 'marquee-x-reverse'

  if (reduced) {
    return (
      <div className="overflow-x-auto">
        <div className="flex w-max">
          {items.map((item, i) => (
            <div key={keyOf(item)}>{renderItem(item, i)}</div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="group relative overflow-hidden">
      <div
        className="flex w-max will-change-transform group-hover:[animation-play-state:paused]"
        /*
          LONGHANDS, not the `animation` shorthand. The shorthand resets every
          sub-property it omits — including `animation-play-state`, which it
          set back to `running` inline. An inline declaration beats a class, so
          `group-hover:[animation-play-state:paused]` above was silently
          overridden and hover-to-pause never worked on any marquee on the
          page. Longhands leave play-state alone for the class to own.
        */
        style={{
          animationName,
          animationDuration: `${speedSec}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        }}
      >
        {[...items, ...items].map((item, i) => (
          <div key={`${keyOf(item)}-${i}`}>{renderItem(item, i % items.length)}</div>
        ))}
      </div>
    </div>
  )
}
