import { CATEGORY_LABELS, type GigCategory } from '@tenda/shared'

/**
 * Category chip. Tones are taxonomy, never decoration (design brief) — the
 * five category token families are generated from the mobile theme.
 */
const TONE_CLASSES: Record<GigCategory, string> = {
  delivery: 'bg-category-delivery-surface text-category-delivery-text border-category-delivery-border',
  photo: 'bg-category-photo-surface text-category-photo-text border-category-photo-border',
  errand: 'bg-category-errand-surface text-category-errand-text border-category-errand-border',
  service: 'bg-category-service-surface text-category-service-text border-category-service-border',
  digital: 'bg-category-digital-surface text-category-digital-text border-category-digital-border',
}

export function CategoryBadge({ category }: { category: GigCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${TONE_CLASSES[category]}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  )
}
