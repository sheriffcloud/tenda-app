/**
 * Profile activity counts, read as server-side COUNTs rather than derived
 * from a page of gig rows (open_issues MB2).
 *
 * The screen used to pull up to 100 posted + 100 worked gigs and `.filter()`
 * them in JS. That is wrong twice over: the cap silently truncates past 100,
 * and a status-bucketed count can't be derived from a page at all. Each stat
 * is now `?mine=…&status=…&limit=1`, where the answer is the response `total`
 * and the single returned row is just the smallest legal page.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { POSTED_ESCROW_STATUSES, type EscrowStatus } from '@tenda/shared'
import { api } from '@/api/client'

/** Statuses that mean "this gig still needs the poster's attention". */
const ACTIVE_STATUSES: EscrowStatus[] = ['open', 'accepted', 'submitted']

/**
 * "Posted" excludes drafts. A draft is a pre-signature staging row — nothing
 * was funded and nobody can see it — so counting it here inflated the number
 * the user reads as "gigs I posted". Drafts are reached from the banner at the
 * top of My Gigs → Posted, which opens /my-gigs/drafts.
 */
const POSTED_STATUSES: EscrowStatus[] = [...POSTED_ESCROW_STATUSES]

export interface ProfileStats {
  /** Gigs the user has posted on-chain — every status except `draft`. */
  posted: number
  /** Posted gigs still in flight — drives the "N active" affordance. */
  active: number
  /** Gigs the user worked through to completion. */
  completed: number
  /** False until the first load settles, so zeroes aren't rendered as fact. */
  loaded: boolean
  reload: () => void
}

const EMPTY = { posted: 0, active: 0, completed: 0 }

/** One count: smallest legal page, answer read off `total`. */
async function countOf(mine: 'created' | 'working', status?: EscrowStatus[]): Promise<number> {
  const { total } = await api.gigs.list({ mine, status, limit: 1 })
  return total
}

export function useProfileStats(userId: string | undefined): ProfileStats {
  const [stats, setStats] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)
  // Drops superseded responses, so a fast account switch can't leave one
  // user's counts on another user's profile.
  const genRef = useRef(0)

  const reload = useCallback(() => {
    if (userId === undefined) return
    const gen = ++genRef.current
    void (async () => {
      try {
        const [posted, active, completed] = await Promise.all([
          countOf('created', POSTED_STATUSES),
          countOf('created', ACTIVE_STATUSES),
          countOf('working', ['completed']),
        ])
        if (gen !== genRef.current) return
        setStats({ posted, active, completed })
        setLoaded(true)
      } catch {
        // Non-fatal: the profile still renders, counts keep their last value.
        // A stat that fails to load is not worth an error screen over.
        if (gen === genRef.current) setLoaded(true)
      }
    })()
  }, [userId])

  // A different account starts from zero rather than showing the previous
  // user's counts while the new ones load. Reset only — the fetch is owned by
  // the focus effect below.
  useEffect(() => {
    setStats(EMPTY)
    setLoaded(false)
  }, [userId])

  /**
   * Fetching lives HERE, not in the screen. Counts must refresh on focus (you
   * come back from posting a gig and the total should move), and `reload`'s
   * identity is keyed to `userId`, so an account switch re-runs this too.
   * Owning it in one place is what keeps it to ONE round of requests per
   * event — a screen adding its own focus effect on top of a self-loading
   * hook silently doubles every load.
   */
  useFocusEffect(reload)

  return { ...stats, loaded, reload }
}
