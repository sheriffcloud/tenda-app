/**
 * Unread-count badge label — a product-wide display rule, so it lives here
 * rather than being re-derived per surface.
 *
 * The cap exists because badges sit in fixed-width furniture (a 40px rail
 * slot, a tab-bar pip, an avatar corner); an uncapped count widens the
 * control and shifts the layout around it. The true number still belongs in
 * the accessible name — cap the pixels, not the information.
 */

export const UNREAD_BADGE_CAP = 9

/**
 * Returns null when there is nothing to show: a "0" pip reads as an alert
 * that is not there, so callers render nothing rather than a zero.
 */
export function unreadBadgeLabel(count: number, cap: number = UNREAD_BADGE_CAP): string | null {
  if (!Number.isFinite(count) || count < 1) return null
  return count > cap ? `${cap}+` : String(count)
}
