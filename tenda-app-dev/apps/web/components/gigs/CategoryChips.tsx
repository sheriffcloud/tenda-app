'use client'

/**
 * The /gigs category chips (#60): "All" plus every category in the shared
 * vocabulary, as `aria-pressed` toggles over the browse store — so the column
 * and the grid, two trees, narrow the same list. The shared pill toggle, as
 * the preview draws them; the pressed chip is the ink fill.
 */
import { CATEGORY_LABELS, GIG_CATEGORIES, type GigCategory } from '@tenda/shared'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'
import { pillToggleClass } from '@/components/ui/pill-toggle'
import { cn } from '@/lib/cn'
import { OPEN_GIGS_COPY } from './copy'

function Chip({
  label,
  pressed,
  onClick,
}: {
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={pillToggleClass(pressed)}>
      {label}
    </button>
  )
}

export function CategoryChips({ className }: { className?: string }) {
  const category = useGigsBrowseStore((s) => s.category)
  const setCategory = useGigsBrowseStore((s) => s.setCategory)
  const pick = (next: GigCategory | null) => () => setCategory(next)
  return (
    <div
      role="group"
      aria-label={OPEN_GIGS_COPY.categoryGroup}
      className={cn('flex gap-1.5 overflow-x-auto [scrollbar-width:none]', className)}
    >
      <Chip label={OPEN_GIGS_COPY.allCategories} pressed={category === null} onClick={pick(null)} />
      {GIG_CATEGORIES.map((key) => (
        <Chip key={key} label={CATEGORY_LABELS[key]} pressed={category === key} onClick={pick(key)} />
      ))}
    </div>
  )
}
