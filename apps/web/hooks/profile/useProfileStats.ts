/**
 * The signed-in user's profile activity counts, from ONE round trip
 * (`GET /v1/users/me/overview`, #17) instead of four limit-1 list reads.
 * The server computes each figure with the predicate its list route filters
 * by, so these numbers equal the `total` those lists report.
 *
 * "Posted" excludes drafts (POSTED_ESCROW_STATUSES, applied server-side): a
 * draft is a pre-signature staging row nobody can see; counting it would
 * inflate the number the user reads as "gigs I posted". Mobile's focus
 * refetch becomes mount (web pages remount per navigation).
 *
 * All-or-nothing: one request, so a failure is `error` for every figure —
 * the old per-call review swallow existed only because four calls could fail
 * independently.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LoadStatus } from '@tenda/shared'
import { api } from '@/api/client'

export interface ProfileStats {
  /** Gigs the user has posted on-chain — every status except `draft`. */
  posted: number
  /** Posted gigs still in flight — drives the "N active" affordance. */
  active: number
  /** Gigs the user worked through to completion. */
  completed: number
  /**
   * Reviews left ABOUT this user — the denominator behind review_score, so a
   * 5.0 from one review cannot read like a 5.0 from forty.
   */
  reviews: number
  /**
   * Where the read got to. Replaces a `loaded` boolean, which could not tell
   * "the answer is zero" from "we could not check" — and since the counts are
   * zeroed before every fetch, a failure rendered Posted 0 / Completed 0 as
   * fact. Only `ready` means the numbers below are answers.
   */
  status: LoadStatus
  reload: () => void
}

const EMPTY = { posted: 0, active: 0, completed: 0, reviews: 0 }

export function useProfileStats(userId: string | undefined): ProfileStats {
  const [stats, setStats] = useState(EMPTY)
  const [status, setStatus] = useState<LoadStatus>('idle')
  // Drops superseded responses, so a fast account switch can't leave one
  // user's counts on another user's profile.
  const genRef = useRef(0)

  const reload = useCallback(() => {
    const gen = ++genRef.current
    void (async () => {
      // A different account starts from zero rather than showing the previous
      // user's counts while the new ones load (async — never sync-in-effect).
      // The no-account branch is INSIDE this microtask for the same reason:
      // `reload` runs from an effect, and resetting synchronously there is the
      // cascading-render the lint refuses.
      await Promise.resolve()
      if (gen !== genRef.current) return
      setStats(EMPTY)
      // Nothing asked for: back to `idle` rather than leaving the previous
      // user's numbers standing under a `ready` status.
      if (userId === undefined) {
        setStatus('idle')
        return
      }
      setStatus('loading')
      try {
        const overview = await api.users.myOverview()
        if (gen !== genRef.current) return
        setStats(overview.stats)
        setStatus('ready')
      } catch {
        // The profile still renders — these counts are supplementary — but it
        // says so, and offers `reload`, rather than printing the zeros this
        // function set on its way in. `EMPTY` is not an answer here.
        if (gen === genRef.current) setStatus('error')
      }
    })()
  }, [userId])

  useEffect(() => {
    reload()
  }, [userId, reload])

  return { ...stats, status, reload }
}
