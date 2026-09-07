/**
 * Rail navigation config — data, not JSX, so the item set is testable without
 * rendering and a new destination is one entry rather than a new branch.
 *
 * Deliberately store-free: an item declares WHICH counter it shows via
 * `badge`, and Rail resolves the number. That keeps this module pure and
 * stops the config from reaching into state it has no business knowing about.
 */
import {
  ArrowLeftRight,
  Bell,
  Home,
  LayoutList,
  ListChecks,
  MessageSquare,
  Scale,
  Wallet,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { isComposerPath, listHomeFor } from '../surfaces'

/** Which live counter an item surfaces. */
export type RailBadgeSource = 'messages' | 'notifications'

export interface RailItem {
  href: string
  /** Accessible name — the rail is icon-only, so this is the ONLY label. */
  label: string
  icon: LucideIcon
  badge?: RailBadgeSource
}

/**
 * Every destination the previous top-nav shell could reach is present:
 * Home, My Gigs, Messages, Wallet and Trade carry over from its
 * NAV/EXCHANGE_NAV, the bell becomes the Notifications item, and Post
 * becomes the rail's primary action (see RAIL_ACTION).
 */
export const RAIL_ITEMS: readonly RailItem[] = [
  { href: '/home', label: 'Home', icon: Home },
  // #60: /home became the dashboard, and browsing the open feed got its own
  // surface. `LayoutList` reads as "the list of everything", beside My Gigs'
  // ticked list of the reader's own.
  { href: '/gigs', label: 'Gigs', icon: LayoutList },
  { href: '/my-gigs', label: 'My Gigs', icon: ListChecks },
  { href: '/messages', label: 'Messages', icon: MessageSquare, badge: 'messages' },
  { href: '/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
  // Promoted out of the profile page (user, 2026-08-24, spec-correction #45):
  // a party mid-dispute must not have to remember where the entrance is
  // buried. `Scale` is the brief's own icon for it. No badge — nothing on the
  // wire counts unread disputes, and a fabricated counter is worse than none.
  { href: '/disputes', label: 'Disputes', icon: Scale },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  // Visible to EVERYONE (spec-correction #50, mobile parity + server decision
  // #14): browsing and accepting are open to all authed users; the old
  // advanced-mode lock hid a tab mobile always shows.
  { href: '/exchange', label: 'Trade', icon: ArrowLeftRight },
]

/** The rail's primary action, pinned below the scrollable item list. */
export const RAIL_ACTION = { href: '/create', label: 'Create' } as const

export const RAIL_SETTINGS = { href: '/settings', label: 'Settings' } as const
export const RAIL_PROFILE = { href: '/profile', label: 'Your profile' } as const
/** Foot-cluster entry (user, 2026-08-24): linking a wallet was buried two
 *  levels into Settings, and it is the one setup step escrow cannot proceed
 *  without. `WalletCards`, not `Wallet` — that glyph is the balances surface. */
export const RAIL_LINK_WALLET = {
  href: '/settings/linked-wallets',
  label: 'Link a wallet',
  icon: WalletCards,
} as const

/**
 * Segment-aware active test. A plain `startsWith` would light up My Gigs on
 * a hypothetical `/my-gigs-archive`, and Wallet on `/walletsomething` — the
 * href must match the whole path or a whole leading segment of it.
 *
 * A selection can also live under a DIFFERENT segment than its list: a thread
 * is /chat/<id> but its item is Messages, a mediation thread is /dispute/<id>
 * but its item is Disputes. surfaces.ts already owns that mapping
 * (SURFACE_LIST_HOME feeds the ≤900px back link from it), so the rail resolves
 * through it rather than re-encoding which list owns which surface.
 *
 * A composer lights nothing: `/gigs/new` sits under the /gigs segment but is
 * the Create action's destination, not a place in the Gigs list (surfaces.ts).
 */
export function isRailItemActive(pathname: string, href: string): boolean {
  if (isComposerPath(pathname)) return false
  if (pathname === href || pathname.startsWith(`${href}/`)) return true
  const surface = pathname.split('/')[1] ?? ''
  return listHomeFor(surface)?.href === href
}

/**
 * The Settings foot item's own active test: quiet while the linked-wallets
 * child is open, because that child has its own foot entry and two lit rows
 * for one location read as two locations.
 */
export function isSettingsItemActive(pathname: string): boolean {
  return (
    isRailItemActive(pathname, RAIL_SETTINGS.href) &&
    !isRailItemActive(pathname, RAIL_LINK_WALLET.href)
  )
}
