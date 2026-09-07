import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'

interface Props<T> {
  items: readonly T[]
  renderItem: (item: T, index: number) => ReactNode
  /** Stable React key off this item field. */
  keyOf: (item: T) => string
  /** How often the front card swipes away. */
  intervalMs?: number
  /** Container must own the deck's height — cards fill it absolutely. */
  className?: string
}

/** Visible stack depth (front card + two peeking behind). */
const DEPTH = 3

/**
 * Stacked-card cycler with flick physics: the front card is thrown upward
 * (`deck-flick` keyframes — fast start, slight spin, late fade) while the
 * cards behind settle forward on a springy curve, each a beat behind the
 * last (`.deck-pos-*` in index.css). Every item stays mounted (they're
 * lightweight cards) so position changes are pure CSS.
 *
 * Reduced motion: renders the static three-card stack, no cycling.
 */
export function SwipeDeck<T>({
  items,
  renderItem,
  keyOf,
  intervalMs = 2800,
  className,
}: Props<T>) {
  const reduced = useReducedMotion()
  const [head, setHead] = useState(0)
  const count = items.length

  useEffect(() => {
    if (reduced || count <= 1) return
    const id = setInterval(() => setHead((h) => (h + 1) % count), intervalMs)
    return () => clearInterval(id)
  }, [reduced, count, intervalMs])

  return (
    <div className={cn('relative', className)} aria-live="off">
      {items.map((item, i) => {
        const pos = (i - head + count) % count
        const state =
          pos < DEPTH ? `deck-pos-${pos}` : pos === count - 1 && !reduced ? 'deck-exit' : 'deck-hidden'
        return (
          <div
            key={keyOf(item)}
            aria-hidden={state !== 'deck-pos-0'}
            className={cn('deck-card', state)}
          >
            {renderItem(item, i)}
          </div>
        )
      })}
    </div>
  )
}
