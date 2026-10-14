'use client'

/**
 * The Settings & Profile comp's "Work you have done" block: one chip per gig
 * category the user has actually delivered in, with how many times.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING, like VerifiedBlock beside it. The
 * endpoint returns only categories with work behind them, so an empty answer
 * is a whole absent block rather than five chips reading zero — a profile
 * claiming "Delivery 0 · Creative 0" says less than one that says nothing, and
 * says it about a brand-new account in the least generous way available.
 *
 * THE HEADING FOLLOWS THE READER, not the route. The comp writes "Work you
 * have done", which is only true on your own profile; the same component is on
 * /profile/[id], where a stranger is reading. Derived from the session rather
 * than passed per route because /profile/<your own id> is reachable and is
 * still your work.
 */
import { CATEGORY_LABELS } from '@tenda/shared'
import { cn } from '@/lib/cn'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { CATEGORY_TONE } from '@/components/gig/category-icons'
import { useAuthStore } from '@/stores/auth.store'
import { useCompletedWork } from '@/hooks/profile/useCompletedWork'

export function CompletedWork({ userId }: { userId: string }) {
  const myId = useAuthStore((s) => s.user?.id ?? null)
  const work = useCompletedWork(userId)

  if (work.length === 0) return null

  const heading = userId === myId ? 'Work you have done' : 'Work completed'

  return (
    <section aria-label={heading}>
      <Eyebrow as="h2" className="mb-3">
        {heading}
      </Eyebrow>
      <ul className="flex flex-wrap gap-2">
        {work.map(({ category, count }) => (
          <li
            key={category}
            className="flex items-center gap-[7px] rounded-full border border-border-subtle bg-surface-card px-3.5 py-[7px] type-body-small font-semibold text-content-secondary"
          >
            <span
              aria-hidden
              className={cn('h-[7px] w-[7px] shrink-0 rounded-full', CATEGORY_TONE[category].dot)}
            />
            {CATEGORY_LABELS[category]}
            <span className="font-numeric text-xs text-content-tertiary">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
