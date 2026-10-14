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
import { POSTED_ESCROW_STATUSES, type EscrowStatus, type LoadStatus } from '@tenda/shared'
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
  /**
   * Where the read got to. Replaces a `loaded` boolean, which could not tell
   * "the answer is zero" from "we could not check" — so a FIRST load that
   * failed published the reset zeros with loaded=true and the screen stated
   * them as fact. Only `ready` means the numbers below are answers.
   *
   * The old catch comment ("counts keep their last value") was true only of a
   * FOCUS refetch, where nothing had zeroed them; on first load and on an
   * account switch the reset effect below had already run.
   */
  status: LoadStatus
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
  const [status, setStatus] = useState<LoadStatus>('idle')
  // Drops superseded responses, so a fast account switch can't leave one
  // user's counts on another user's profile.
  const genRef = useRef(0)

  const reload = useCallback(() => {
    const gen = ++genRef.current
    // No account, nothing asked for: back to `idle` rather than leaving the
    // previous user's numbers standing under a `ready` status.
    if (userId === undefined) {
      setStats(EMPTY)
      setStatus('idle')
      return
    }
    void (async () => {
      // A refetch over settled counts keeps them on screen and does NOT
      // re-raise the skeleton — only a load with nothing behind it is
      // 'loading'. Same guard chat.store uses for its inbox.
      setStatus((current) => (current === 'ready' ? current : 'loading'))
      try {
        const [posted, active, completed] = await Promise.all([
          countOf('created', POSTED_STATUSES),
          countOf('created', ACTIVE_STATUSES),
          countOf('working', ['completed']),
        ])
        if (gen !== genRef.current) return
        setStats({ posted, active, completed })
        setStatus('ready')
      } catch {
        // The screen still renders — these counts are supplementary — but a
        // failure says so and offers `reload` rather than presenting the reset
        // zeros as the account's history.
        if (gen === genRef.current) setStatus('error')
      }
    })()
  }, [userId])

  // A different account starts from zero rather than showing the previous
  // user's counts while the new ones load. Reset only — the fetch is owned by
  // the focus effect below.
  useEffect(() => {
    setStats(EMPTY)
    setStatus('idle')
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

  return { ...stats, status, reload }
}
