/**
 * Web port of apps/mobile/hooks/useProfileStats.ts: profile activity
 * counts read as server-side COUNTs (`?mine=…&status=…&limit=1`, answer
 * off `total`) — never derived from a capped page of rows.
 *
 * "Posted" excludes drafts (POSTED_ESCROW_STATUSES): a draft is a
 * pre-signature staging row nobody can see; counting it would inflate the
 * number the user reads as "gigs I posted". Mobile's focus refetch
 * becomes mount (web pages remount per navigation).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { POSTED_ESCROW_STATUSES, type EscrowStatus, type LoadStatus } from '@tenda/shared'
import { api } from '@/api/client'

/** Statuses that mean "this gig still needs the poster's attention". */
const ACTIVE_STATUSES: EscrowStatus[] = ['open', 'accepted', 'submitted']

const POSTED_STATUSES: EscrowStatus[] = [...POSTED_ESCROW_STATUSES]

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

/**
 * Reviews about this user, same convention: smallest page, read the total.
 *
 * Swallows its own failure. It rides the same `Promise.all` as the gig
 * counts, so a rejection here would reject the batch and blank Posted and
 * Completed as well — losing three good numbers because a supplementary
 * fourth was unavailable. A missing count reads as "no reviews yet", which is
 * also what a genuine zero reads as; the gig counts stay true either way.
 */
async function reviewCountOf(userId: string): Promise<number> {
  try {
    const { total } = await api.users.reviews({ id: userId }, { limit: 1 })
    return total
  } catch {
    return 0
  }
}

/** One count: smallest legal page, answer read off `total`. */
async function countOf(mine: 'created' | 'working', status?: EscrowStatus[]): Promise<number> {
  const { total } = await api.gigs.list({ mine, status, limit: 1 })
  return total
}

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
        const [posted, active, completed, reviews] = await Promise.all([
          countOf('created', POSTED_STATUSES),
          countOf('created', ACTIVE_STATUSES),
          countOf('working', ['completed']),
          reviewCountOf(userId),
        ])
        if (gen !== genRef.current) return
        setStats({ posted, active, completed, reviews })
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
