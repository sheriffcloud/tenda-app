/**
 * The create menu IS mobile's FAB pairing (spec-correction #50): a gig
 * composer, and the ONE sell surface — never a second offer composer. The
 * href assertions are the regression net for /offers/new coming back.
 */
import { expect, it } from 'vitest'
import { CREATE_OPTIONS } from '@/components/create/create-options'

it('offers exactly the FAB pairing: create gig, and sell/cash-out', () => {
  expect(CREATE_OPTIONS.map((o) => o.menuLabel)).toEqual(['Create gig', 'Sell / Cash out'])
})

it('points selling at the sell surface — a retired composer route would 404', () => {
  expect(CREATE_OPTIONS.map((o) => o.href)).toEqual(['/gigs/new', '/wallet/buy-sell'])
})

it('gives every option non-empty card copy — an empty title renders a blank card', () => {
  // No icon assertion: `icon` is required by the type, so a check on it could
  // never fail while the file compiles (Rule 3 — no decorative assertions).
  for (const option of CREATE_OPTIONS) {
    expect(option.title.length).toBeGreaterThan(0)
    expect(option.description.length).toBeGreaterThan(0)
  }
})
