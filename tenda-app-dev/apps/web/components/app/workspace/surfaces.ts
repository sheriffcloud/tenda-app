/**
 * The workspace surface/selection contract.
 *
 * A "surface" is the first path segment inside the (app) group — /messages,
 * /my-gigs, /wallet. Everything deeper identifies WHICH row of that surface is
 * open, and that is the "selection".
 *
 *   /messages              surface=messages  selection=none
 *   /messages/abc-123      surface=messages  selection=abc-123
 *   /settings/security     surface=settings  selection=security
 *
 * Two things read this contract:
 *   - the detail pane, for its accessible name and its focus hand-off (a
 *     changed selection moves focus, which is what makes the ≤900px
 *     single-pane collapse usable);
 *   - the @list parallel-route slot, which supplies a surface's list column.
 *     Adding a list to a surface is `app/(app)/@list/<surface>/page.tsx` PLUS
 *     a `SURFACE_LIST_HOME` entry below — no layout edit. The entry was
 *     already required for the ≤900px back link; since AppWorkspace also
 *     reads it to decide whether to render the slot at all, a list without one
 *     now renders nowhere. `list-registry.test.ts` fails on the omission
 *     rather than leaving it to be found on a phone.
 */

import { ROUTES } from '@/lib/routes'

/**
 * Composer routes — reached from Create — are not a ROW of any list, even
 * when their path sits under a surface that has one: `/gigs/new` predates
 * the /gigs browse surface (#60) and lives under its segment. The pane draws
 * no back link for them and the rail lights nothing, as it did before #60.
 */
const COMPOSER_PATHS: ReadonlySet<string> = new Set([ROUTES.create, ROUTES.createGig])

export function isComposerPath(pathname: string): boolean {
  return COMPOSER_PATHS.has(pathname)
}

/** Human name per surface, used as the detail pane's accessible name. */
const SURFACE_TITLES: Record<string, string> = {
  home: 'Home',
  gigs: 'Gigs',
  'my-gigs': 'My Gigs',
  messages: 'Messages',
  chat: 'Conversation',
  notifications: 'Notifications',
  wallet: 'Wallet',
  exchange: 'Trade',
  gig: 'Gig',
  disputes: 'Disputes',
  dispute: 'Dispute',
  profile: 'Profile',
  settings: 'Settings',
}

/**
 * Where the ≤900px "back" affordance goes, per surface that HAS a list column.
 *
 * Not derivable from the URL: a chat thread lives at /chat/<userId> but its
 * list is the inbox at /messages, so `/${surface}` would send the reader to a
 * route that does not exist. A surface absent from this map has no list, and
 * the detail pane renders no back link at all — there is nothing behind it.
 *
 * That last sentence is now load-bearing in a second place: AppWorkspace asks
 * this map whether to render the @list slot, because the slot itself cannot
 * answer it (Next retains an unmatched slot's last subpage across a soft
 * navigation). Keep the map exhaustive; the drift guard is
 * `__tests__/list-registry.test.ts`.
 */
export interface ListHome {
  href: string
  /** Names the list, not the direction — "Back" alone says nothing on arrival. */
  label: string
}

const SURFACE_LIST_HOME: Record<string, ListHome> = {
  messages: { href: '/messages', label: 'All messages' },
  chat: { href: '/messages', label: 'All messages' },
  disputes: { href: '/disputes', label: 'All disputes' },
  dispute: { href: '/disputes', label: 'All disputes' },
  'my-gigs': { href: '/my-gigs', label: 'All my gigs' },
  notifications: { href: '/notifications', label: 'All notifications' },
  // Browsing moved from /home to /gigs in #60; /home is the dashboard and
  // has no list column.
  gigs: { href: '/gigs', label: 'All open gigs' },
}

/** The list behind this surface's detail pane, or null when it has none. */
export function listHomeFor(segment: string | null): ListHome | null {
  if (segment === null) return null
  return SURFACE_LIST_HOME[segment] ?? null
}

/**
 * Where the pane's ≤900px back link goes: the PARENT of a nested selection,
 * and the list for a top-level one.
 *
 * `/my-gigs/<id>/applicants` is a step past `/my-gigs/<id>`, so sending it
 * back to the list skips the escrow the reader was looking at — and below
 * 900px the column that would have offered it is off-screen. One rule, no
 * per-surface entry: anything deeper than one segment goes back one segment.
 */
export function paneBackFor(segment: string | null, selection: string | null): ListHome | null {
  const home = listHomeFor(segment)
  if (home === null || selection === null) return null
  const cut = selection.lastIndexOf('/')
  if (cut === -1) return home
  return { href: `/${segment}/${selection.slice(0, cut)}`, label: PARENT_BACK_LABEL }
}

/** Names the step, not the direction — "Back" alone says nothing on arrival. */
const PARENT_BACK_LABEL = 'Back'

/** Fallback so an unregistered surface still gets a usable region name. */
export const DEFAULT_SURFACE_TITLE = 'Workspace'

export function surfaceTitle(segment: string | null): string {
  if (segment === null) return DEFAULT_SURFACE_TITLE
  return SURFACE_TITLES[segment] ?? DEFAULT_SURFACE_TITLE
}

/**
 * The open row's identity, or null when the surface itself is open with
 * nothing selected.
 *
 * Route groups appear in the segment list as "(name)" and parallel slots as
 * "@name"; neither is part of the URL, so neither can identify a selection.
 */
export function selectionKey(segments: readonly string[]): string | null {
  const real = segments.filter(
    (segment) => !segment.startsWith('(') && !segment.startsWith('@'),
  )
  // [0] is the surface; anything after it identifies the selection. Joined so
  // /my-gigs/<id>/applicants and /my-gigs/<id> are distinct selections.
  if (real.length < 2) return null
  return real.slice(1).join('/')
}
