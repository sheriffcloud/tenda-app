/**
 * Gig categories. Mirrors @tenda/shared/constants/categories. Chips render in
 * the neutral inset treatment (see TaskCard / GigListRow) — no per-category
 * colour tokens.
 */

export const GIG_CATEGORIES = ['delivery', 'photo', 'errand', 'service', 'digital'] as const

export type CategoryId = (typeof GIG_CATEGORIES)[number]

export interface CategoryMeta {
  id: CategoryId
  label: string
  emoji: string
  /** Lucide icon name — looked up at render-time so we don't pull every icon by default. */
  icon: 'Truck' | 'Camera' | 'Footprints' | 'Wrench' | 'Code'
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  delivery: { id: 'delivery', label: 'Delivery', emoji: '📦', icon: 'Truck' },
  photo:    { id: 'photo',    label: 'Photo',    emoji: '📸', icon: 'Camera' },
  errand:   { id: 'errand',   label: 'Errand',   emoji: '🏃', icon: 'Footprints' },
  service:  { id: 'service',  label: 'Service',  emoji: '🛠',  icon: 'Wrench' },
  digital:  { id: 'digital',  label: 'Digital',  emoji: '💻', icon: 'Code' },
}

export const CATEGORY_LIST: CategoryMeta[] = GIG_CATEGORIES.map((id) => CATEGORIES[id])
