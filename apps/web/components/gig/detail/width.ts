import type { CtaWidth } from '@tenda/shared'

/**
 * The Tailwind classes one arrangement width implies — web's twin of
 * mobile's `widthProps` (the arrangement decides widths; each client maps
 * them to its own layout system).
 *  - `full` — alone on its row.
 *  - `grow` — first of a pair, takes the remaining width.
 *  - `auto` — beside a `grow`, sized to its own label.
 */
export function widthClass(width: CtaWidth): string {
  if (width === 'full') return 'w-full'
  if (width === 'grow') return 'flex-1'
  return ''
}

/**
 * A lone secondary fills its row; a pair keeps the weighting the bar has
 * always had — the constructive action takes the space, the danger one is
 * only as wide as its label.
 */
export function secondaryWidth(index: number, count: number): CtaWidth {
  return count === 1 ? 'full' : index === 0 ? 'grow' : 'auto'
}
