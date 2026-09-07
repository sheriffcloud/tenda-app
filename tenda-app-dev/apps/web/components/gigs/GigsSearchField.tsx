'use client'

/**
 * The /gigs search box (#60): free text over title + brief, the same `q` the
 * public feed's rail sends, debounced into the browse store so the column and
 * the grid narrow together. The keyboard walk ignores a typing target
 * (`useListKeyboard`), so "join" typed here never moves the cursor.
 *
 * The placeholder is the FEED's — "Title or brief" — because `q` is a
 * tsvector over exactly those two fields (spec-correction #12); a placeholder
 * promising a city or a poster would send readers looking for a match the
 * index cannot make.
 */
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { FEED_COPY } from '@/components/gig/feed/copy'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'
import { cn } from '@/lib/cn'

/** Long enough to coalesce a typed word, short enough to feel live. */
export const GIGS_SEARCH_DEBOUNCE_MS = 250

export function GigsSearchField({ className }: { className?: string }) {
  const q = useGigsBrowseStore((s) => s.q)
  const setQ = useGigsBrowseStore((s) => s.setQ)
  const [draft, setDraft] = useState(q)

  // The store is the source of truth across remounts (the column is rebuilt
  // on every row opened); the draft only exists so the debounce has somewhere
  // to hold keystrokes.
  useEffect(() => {
    if (draft === q) return
    const timer = window.setTimeout(() => setQ(draft.trim()), GIGS_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, q, setQ])

  return (
    <label
      className={cn(
        'flex h-[38px] items-center gap-2 rounded-sm bg-control-input-background px-3 type-body-small text-content-tertiary focus-within:ring-2 focus-within:ring-brand-focus-ring',
        className,
      )}
    >
      <Search size={15} aria-hidden className="shrink-0" />
      <span className="sr-only">{FEED_COPY.rail.search}</span>
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={FEED_COPY.rail.searchPlaceholder}
        className="min-w-0 flex-1 bg-transparent type-body-small text-control-input-text outline-none placeholder:text-control-input-placeholder"
      />
    </label>
  )
}
