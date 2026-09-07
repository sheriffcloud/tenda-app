/**
 * The RN Button props one arrangement width implies. The arrangement layer
 * itself (slots, branches, rules) lives in @tenda/shared/gig-cta since
 * 2026-08-15 — this is the one render-side mapping that stays per-client.
 * Shared by both renderers so the two cannot drift — `fullWidth` and
 * `flex: 1` fight each other (width 100% vs flex), and getting that wrong in
 * one file only is invisible until a device.
 */
import type { CtaWidth } from '@tenda/shared'

export function widthProps(width: CtaWidth): {
  size: 'xl'
  fullWidth?: true
  style?: { flex: 1 }
} {
  if (width === 'full') return { size: 'xl', fullWidth: true }
  if (width === 'grow') return { size: 'xl', style: { flex: 1 } }
  return { size: 'xl' }
}
