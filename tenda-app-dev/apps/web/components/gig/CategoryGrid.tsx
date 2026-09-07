'use client'

/**
 * Category selector for the composer's details step — web twin of mobile's
 * CategoryGrid: labels from shared CATEGORY_LABELS, glyphs via the shared
 * icon-name resolver.
 */
import { CATEGORY_META, type GigCategory } from '@tenda/shared'
import { cn } from '@/lib/cn'
import { CATEGORY_ICONS } from '@/components/gig/category-icons'

export function CategoryGrid({
  selected,
  onChange,
}: {
  selected: GigCategory | null
  onChange: (category: GigCategory) => void
}) {
  return (
    <div role="radiogroup" aria-label="Category" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {CATEGORY_META.map((meta) => {
        const Icon = CATEGORY_ICONS[meta.key]
        const isSelected = selected === meta.key
        return (
          <button
            key={meta.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(meta.key)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-card border p-3 text-sm transition-colors',
              isSelected
                ? 'border-brand-primary bg-brand-primary-surface text-brand-primary'
                : 'border-border-default bg-surface-card text-content-secondary hover:border-border-strong',
            )}
          >
            <Icon size={20} aria-hidden />
            <span className="font-medium">{meta.label}</span>
          </button>
        )
      })}
    </div>
  )
}
