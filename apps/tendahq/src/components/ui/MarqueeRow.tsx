import type { ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'

interface Props<T> {
  items: readonly T[]
  /** Render one item. Caller controls width. */
  renderItem: (item: T, index: number) => ReactNode
  /** Loop duration in seconds. */
  speedSec?: number
  /**
   * Scroll axis. `x` runs left/right (default); `y` runs a vertical column —
   * `left` maps to upward travel, `right` to downward.
   */
  axis?: 'x' | 'y'
  direction?: 'left' | 'right'
  /** Pause animation on hover. */
  pauseOnHover?: boolean
  /** Mask gradient at the travel edges. */
  edgeFade?: boolean
  className?: string
  itemClassName?: string
  /** Stable React key off this item field. */
  keyOf: (item: T, index: number) => string | number
}

const MASKS = {
  x: 'linear-gradient(to right, transparent 0, black 6%, black 94%, transparent 100%)',
  y: 'linear-gradient(to bottom, transparent 0, black 8%, black 92%, transparent 100%)',
} as const

/**
 * Infinite marquee along either axis. Renders items twice (visually identical)
 * and animates a -50% translate so the seam is invisible. Reduced-motion users
 * get a static, scrollable list.
 */
export function MarqueeRow<T>({
  items,
  renderItem,
  speedSec = 50,
  axis = 'x',
  direction = 'left',
  pauseOnHover = true,
  edgeFade = true,
  className,
  itemClassName,
  keyOf,
}: Props<T>) {
  const reduced = useReducedMotion()
  const animationName =
    axis === 'x'
      ? direction === 'left' ? 'marquee-x' : 'marquee-x-reverse'
      : direction === 'left' ? 'marquee-y' : 'marquee-y-reverse'

  const maskStyle = edgeFade
    ? { WebkitMaskImage: MASKS[axis], maskImage: MASKS[axis] }
    : undefined

  const trackFlex = axis === 'x' ? 'flex w-max gap-4' : 'flex h-max flex-col gap-4'

  if (reduced) {
    return (
      <div
        className={cn(axis === 'x' ? 'overflow-x-auto' : 'overflow-y-auto', className)}
        style={maskStyle}
      >
        <div className={trackFlex}>
          {items.map((item, i) => (
            <div key={keyOf(item, i)} className={itemClassName}>
              {renderItem(item, i)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('group relative overflow-hidden', className)}
      style={maskStyle}
    >
      <div
        className={cn(
          trackFlex,
          'will-change-transform',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
        style={{
          animation: `${animationName} ${speedSec}s linear infinite`,
        }}
      >
        {[...items, ...items].map((item, i) => (
          <div key={`${keyOf(item, i % items.length)}-${i}`} className={itemClassName}>
            {renderItem(item, i % items.length)}
          </div>
        ))}
      </div>
    </div>
  )
}
