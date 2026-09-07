/**
 * A five-star rating row.
 *
 * The Tier-3 and Settings comps draw this identically (`starRow`): five filled
 * `Star` glyphs in `content-primary`, differing only by opacity — 1 for a whole
 * star, .42 for a half, .22 for an empty one. No second colour, no outline
 * variant. So it is one primitive, not one per surface.
 *
 * A "half" is the comps' rule, not a rounding: the fractional part is taken to
 * two decimals and counts as half from .25 upward. That matters because the
 * number beside it is the exact average — stars that rounded 4.4 up to 5 would
 * contradict the "4.4" printed next to them.
 *
 * The row is ONE labelled image to assistive tech. Five identical glyphs
 * announced one at a time say nothing, and the score is the fact anyway.
 */
import { Star } from 'lucide-react'
import { cn } from '@/lib/cn'

/** From this fractional part upward, the next star is drawn half-lit. */
export const HALF_STAR_THRESHOLD = 0.25

const STAR_COUNT = 5

type Fill = 'whole' | 'half' | 'empty'

/** The opacity ramp, straight from both comps. */
const FILL_CLASS: Record<Fill, string> = {
  whole: 'opacity-100',
  half: 'opacity-[0.42]',
  empty: 'opacity-[0.22]',
}

/** Which of the five stars are whole, which one (if any) is half. */
export function starFills(score: number): readonly Fill[] {
  const clamped = Math.min(STAR_COUNT, Math.max(0, score))
  // Rounded to two decimals BEFORE the split, like the comps read it off the
  // wire string: 4.999 is a 5.00 average and must draw as five whole stars,
  // not four and a half.
  const rounded = Math.round(clamped * 100) / 100
  const whole = Math.floor(rounded)
  const half = rounded - whole >= HALF_STAR_THRESHOLD
  return Array.from({ length: STAR_COUNT }, (_, index) =>
    index < whole ? 'whole' : index === whole && half ? 'half' : 'empty',
  )
}

export function RatingStars({
  score,
  size = 13,
  className,
}: {
  score: number
  /** Glyph size in px — 13 on a browse row, 15 in a profile card (the comps). */
  size?: number
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={`${score.toFixed(1)} out of ${STAR_COUNT}`}
      className={cn('flex shrink-0 gap-px', className)}
    >
      {starFills(score).map((fill, index) => (
        <Star
          key={index}
          size={size}
          aria-hidden
          strokeWidth={0}
          className={cn('fill-content-primary text-content-primary', FILL_CLASS[fill])}
        />
      ))}
    </span>
  )
}
