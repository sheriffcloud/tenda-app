'use client'

import { useSyncExternalStore } from 'react'
import { currentReturnPath } from '@/lib/auth/return-path'

/**
 * Never changes while these pages are mounted: the return path lives in the
 * URL, and every navigation that alters it unmounts the step that read it.
 */
function subscribe(): () => void {
  return () => {}
}

/** The client has a URL to read; the server render has none. */
const readOnClient = (): string | null => currentReturnPath()
const readOnServer = (): string | null => null

/**
 * The sign-in destination, for the places that need it while RENDERING —
 * the back and switch-method links, whose `href` has to exist in the markup.
 *
 * `useSyncExternalStore` rather than state-set-in-an-effect, which is a
 * cascading render (and the lint rule that says so). It is also the shape
 * built for this exact problem: a value the server cannot see, with an
 * explicit server snapshot, so the prerendered HTML and the hydrated tree
 * disagree by design rather than by accident. These pages are statically
 * prerendered — reading the URL during render would otherwise have the server
 * produce one href and the browser another — and `useSearchParams` would fix
 * that only by opting the page out of prerendering, which is the cost
 * lib/auth/return-path explains.
 *
 * The NAVIGATIONS do not use this. They read `currentReturnPath()` at the
 * moment they fire, where the value is always present; this is only for hrefs
 * that must be in the markup before anyone clicks.
 */
export function useReturnPath(): string | null {
  return useSyncExternalStore(subscribe, readOnClient, readOnServer)
}
