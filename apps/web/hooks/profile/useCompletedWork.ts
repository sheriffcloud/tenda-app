/**
 * The categories a user has actually delivered in, for the profile's "Work
 * you have done" block (GET /v1/users/:id/completed-work).
 *
 * A server GROUP BY, never a client one: grouping this from the gigs feed
 * would mean paging a user's entire history, and grouping it from ONE page
 * would understate everyone past the first — the same mistake
 * `transactionsSummary` exists to avoid on the wallet screen.
 *
 * Decorative, like `useUserStanding`: an empty array covers "not loaded yet",
 * "nothing completed" and "the request failed", and the block renders nothing
 * for all three. That is deliberate rather than lazy — the alternative is a
 * count, and a count invented while loading or after a failure is the
 * render-zeros-as-fact defect this block is being added next to.
 */
import { useEffect, useState } from 'react'
import type { CompletedWorkCategory } from '@tenda/shared'
import { api } from '@/api/client'

export function useCompletedWork(userId: string): CompletedWorkCategory[] {
  const [work, setWork] = useState<CompletedWorkCategory[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Async reset (not sync-in-effect): the lint forbids cascading renders.
      // Clearing FIRST is what stops one profile's chips being read as the
      // next one's while the new request is in flight — the same reason
      // useProfileStats zeroes before it fetches.
      await Promise.resolve()
      if (cancelled) return
      setWork([])
      try {
        const { data } = await api.users.completedWork({ id: userId })
        if (!cancelled) setWork(data)
      } catch {
        // Decorative: a failed read hides the block, it never blanks a profile.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  return work
}
