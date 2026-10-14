/**
 * The list/grid choice for browsing gigs (#60), remembered per viewer.
 *
 * One preference for BOTH surfaces that draw the open feed — the public
 * landing and the signed-in /gigs — because it is the same reader choosing how
 * to read the same cards, and a choice that reset between the two would read
 * as the app forgetting.
 *
 * localStorage, NOT the account registry: this is a per-browser convenience
 * with no personal data in it, and it should survive a sign-out the way the
 * theme does. And `useSyncExternalStore`, NOT a `useState` seeded in an effect:
 * the server snapshot is the default so the SSR markup and the first client
 * paint agree, and the stored value takes over in the same commit React uses
 * for every external store — no flash from list to grid, no hydration
 * warning. Every storage access is guarded: a private window, cleared site
 * data or a blocked store must degrade to the default, never throw.
 */
import { useSyncExternalStore } from 'react'

export type GigsView = 'list' | 'grid'

export const GIGS_VIEW_KEY = 'tenda:gigs-view'
export const DEFAULT_GIGS_VIEW: GigsView = 'list'

export function isGigsView(value: string | null): value is GigsView {
  return value === 'list' || value === 'grid'
}

let current: GigsView | null = null
const listeners = new Set<() => void>()

function read(): GigsView {
  if (current !== null) return current
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(GIGS_VIEW_KEY)
  } catch {
    stored = null
  }
  current = isGigsView(stored) ? stored : DEFAULT_GIGS_VIEW
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const serverSnapshot = (): GigsView => DEFAULT_GIGS_VIEW

export function setGigsView(view: GigsView): void {
  if (current === view) return
  current = view
  try {
    window.localStorage.setItem(GIGS_VIEW_KEY, view)
  } catch {
    // The choice still holds for this page; it just will not be remembered.
  }
  for (const listener of listeners) listener()
}

/** Forget the cached value so a test can start from storage again. */
export function resetGigsViewForTests(): void {
  current = null
}

export function useGigsView(): [GigsView, (view: GigsView) => void] {
  const view = useSyncExternalStore(subscribe, read, serverSnapshot)
  return [view, setGigsView]
}
