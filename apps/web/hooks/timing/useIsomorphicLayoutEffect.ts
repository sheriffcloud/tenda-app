'use client'

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * WHY IT EXISTS (#46). A hook that mirrors the latest render into a ref for a
 * callback OUTSIDE React to read — a socket listener, a subscription — cannot
 * do that mirroring in a passive effect. Passive effects are deferred: React
 * commits, the DOM is live, and the ref still holds the previous render until a
 * scheduler callback catches up. Anything that fires in that gap reads stale
 * data and cannot tell.
 *
 * That gap is what made `useGigFeedRealtime` drop rows and apply superseded
 * frames roughly one run in ten: a `feed:gigs` frame landing there was reduced
 * against the PREVIOUS list and an unseeded revision map, so the staleness
 * guard — which only engages for a revision it already knows — never ran at
 * all. Deferring that seed by a single macrotask reproduced every symptom the
 * flake had ever shown, deterministically.
 *
 * Layout effects close it because they run synchronously inside the commit,
 * before React yields to the event loop, so no message callback can interleave.
 *
 * The isomorphic half is not decoration: `useLayoutEffect` logs a warning when
 * React renders on the server, and both callers sit under server-rendered
 * routes. `useEffect` there is correct rather than a compromise — the server
 * renders once, has no socket, and never reaches the gap this closes.
 */
/*
 * COVERAGE NOTE: the branch below reports 0% and that is a reporting artifact,
 * not an untested arm. The choice is made once at module load, so each
 * environment can only ever take one side of it — jsdom always has a `window`.
 * Both arms ARE tested, in `__tests__/useIsomorphicLayoutEffect.test.ts` and its
 * `.ssr.test.ts` sibling under a node environment, and each is mutation-proved:
 * pinning this to either effect reddens the opposite file. v8 does not merge the
 * two runs' branch maps for a module-scope ternary, so the cell stays red.
 * Do not "fix" it by collapsing the ternary.
 */
import { useEffect, useLayoutEffect } from 'react'

export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect
