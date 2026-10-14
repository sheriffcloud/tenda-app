import { describe, expect, it } from 'vitest'
import {
  RAIL_ACTION,
  RAIL_ITEMS,
  RAIL_LINK_WALLET,
  isRailItemActive,
  isSettingsItemActive,
} from '@/components/app/workspace/rail'

describe('isRailItemActive', () => {
  it.each([
    ['/home', '/home'],
    ['/my-gigs', '/my-gigs'],
    ['/my-gigs/drafts', '/my-gigs'],
    ['/messages/abc-123', '/messages'],
    ['/settings/linked-wallets', '/settings'],
    // A selection under a DIFFERENT segment than its list: resolved through
    // surfaces.ts, so opening a thread no longer un-lights its rail item.
    ['/chat/user-1', '/messages'],
    ['/dispute/escrow-9', '/disputes'],
    ['/disputes', '/disputes'],
  ])('treats %s as active for %s', (pathname, href) => {
    expect(isRailItemActive(pathname, href)).toBe(true)
  })

  it('does not light Messages for an unrelated deep surface', () => {
    // The cross-surface rule must come from the list-home map, not from a
    // looser prefix — /wallet/intents/x has no list and lights only Wallet.
    expect(isRailItemActive('/wallet/intents/abc', '/messages')).toBe(false)
    expect(isRailItemActive('/chat/user-1', '/disputes')).toBe(false)
  })

  it.each([
    ['/', '/gig'],
    ['/my-gigs-archive', '/my-gigs'],
    ['/walletsomething', '/wallet'],
    ['/homepage', '/home'],
  ])('does NOT treat %s as active for %s (prefix is not a segment)', (pathname, href) => {
    // A plain startsWith would light the wrong item up for every one of these.
    expect(isRailItemActive(pathname, href)).toBe(false)
  })

  it('does not match an unrelated path', () => {
    expect(isRailItemActive('/wallet', '/messages')).toBe(false)
  })

  it('lights NOTHING on a composer — /gigs/new is the Create action, not a gig', () => {
    // #60 gave /gigs a rail item; the wizard already lived under that segment,
    // and it lit nothing before, so it must light nothing now.
    for (const item of RAIL_ITEMS) expect(isRailItemActive('/gigs/new', item.href)).toBe(false)
    for (const item of RAIL_ITEMS) expect(isRailItemActive('/create', item.href)).toBe(false)
    // …while an actual open gig does light Gigs.
    expect(isRailItemActive('/gigs/gig-delivery-1', '/gigs')).toBe(true)
  })

  it('matches nothing when the pathname is the bare root', () => {
    for (const item of RAIL_ITEMS) expect(isRailItemActive('/', item.href)).toBe(false)
  })
})

describe('isSettingsItemActive', () => {
  it('lights Settings on its own surface, children included', () => {
    expect(isSettingsItemActive('/settings')).toBe(true)
    expect(isSettingsItemActive('/settings/security')).toBe(true)
  })

  it('yields to the linked-wallets foot entry rather than double-lighting', () => {
    // The child has its own rail row; two lit rows for one location read as
    // two places.
    expect(isSettingsItemActive(RAIL_LINK_WALLET.href)).toBe(false)
    expect(isRailItemActive(RAIL_LINK_WALLET.href, RAIL_LINK_WALLET.href)).toBe(true)
  })

  it('stays dark off the settings surface entirely', () => {
    expect(isSettingsItemActive('/wallet')).toBe(false)
  })
})

describe('rail item visibility', () => {
  it('offers Trade unconditionally — the advanced-mode gate is gone (#50)', () => {
    // Mobile parity: the Trade tab is shown to everyone; browse/accept were
    // always open on the wire (server decision #14).
    expect(RAIL_ITEMS.map((i) => i.href)).toContain('/exchange')
  })
})

describe('rail item config', () => {
  it('preserves every destination the previous top-nav shell could reach', () => {
    // Regression net for the shell swap: Create moved to the rail action and
    // the bell became the Notifications item, but nothing may be dropped.
    const reachable = new Set([...RAIL_ITEMS.map((i) => i.href), RAIL_ACTION.href])
    for (const href of ['/home', '/create', '/my-gigs', '/messages', '/wallet', '/exchange', '/notifications', '/disputes']) {
      expect(reachable, `${href} is no longer reachable from the rail`).toContain(href)
    }
  })

  it('declares no unread badge on Disputes — nothing on the wire counts one', () => {
    // A counter with no data source would render a fabricated alert.
    expect(RAIL_ITEMS.find((i) => i.href === '/disputes')?.badge).toBeUndefined()
  })

  it('gives the link-wallet entry its own glyph, distinct from the balances item', () => {
    const wallet = RAIL_ITEMS.find((i) => i.href === '/wallet')
    expect(wallet).toBeDefined()
    expect(RAIL_LINK_WALLET.icon).not.toBe(wallet?.icon)
  })

  it('gives every item a non-empty label — the rail is icon-only', () => {
    for (const item of RAIL_ITEMS) expect(item.label.trim().length).toBeGreaterThan(0)
  })

  it('has no duplicate hrefs', () => {
    const hrefs = RAIL_ITEMS.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('only declares badge sources the Rail can resolve', () => {
    for (const item of RAIL_ITEMS) {
      if (item.badge !== undefined) expect(['messages', 'notifications']).toContain(item.badge)
    }
  })
})
