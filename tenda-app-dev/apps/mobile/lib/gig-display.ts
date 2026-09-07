/**
 * Everything display-rule-shaped moved to @tenda/shared/utils/gig-display
 * (2026-08-15) so mobile and web share one set of status/deadline rules.
 * Only this stays: it takes the MOBILE theme object, which web does not have.
 */
import type { AppTheme } from '@/theme/themes'
import type { EscrowStatus } from '@tenda/shared'

/**
 * Resolved hex colour for a gig's category dot.
 *
 * Guarded, because `theme.colors.category` is a fixed record over the five
 * categories this build knows and the wire can carry one it does not: an old
 * install keeps running after the server adds a category, and the cards
 * already anticipate that on the LABEL (`CATEGORY_META.find(...) ?? category`).
 * The colour lookup beside it did not, so an unknown category threw on
 * `.base` and took the whole list down with it — a render throw in a list row
 * is not a missing dot, it is a blank screen.
 *
 * Falls back to the same neutral `statusDotColor` uses for a status it does
 * not recognise, so the two dots degrade the same way.
 */
export function categoryDotColor(theme: AppTheme, category: string): string {
  const tone = (theme.colors.category as Record<string, { base: string } | undefined>)[category]
  return tone?.base ?? theme.colors.content.tertiary
}

/** Resolved hex color for status dots in card compositions (GigCardCompact). */
export function statusDotColor(theme: AppTheme, status: EscrowStatus): string {
  switch (status) {
    case 'open':
    case 'completed':
    case 'resolved':
      return theme.colors.feedback.success.base
    case 'accepted':
      return theme.colors.brand.primary
    case 'submitted':
      return theme.colors.feedback.warning.base
    case 'disputed':
      return theme.colors.feedback.danger.base
    default:
      return theme.colors.content.tertiary
  }
}
