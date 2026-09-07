import type { GigCategory } from '@tenda/shared'

// ── Category metadata ─────────────────────────────────────────────────
// Display registry for gig categories: label, lucide icon, and theme
// colour token. Single source for the feed grid, gig cards, detail body,
// and the filter sheet.

type CategoryColorToken =
  | 'categoryDelivery'
  | 'categoryPhoto'
  | 'categoryErrand'
  | 'categoryService'
  | 'categoryDigital'

export interface CategoryMeta {
  key: GigCategory
  label: string
  icon: string // lucide icon name
  colorToken: CategoryColorToken
}

export const CATEGORY_META: CategoryMeta[] = [
  { key: 'delivery', label: 'Delivery', icon: 'Truck', colorToken: 'categoryDelivery' },
  { key: 'photo', label: 'Photo', icon: 'Camera', colorToken: 'categoryPhoto' },
  { key: 'errand', label: 'Errand', icon: 'ShoppingBag', colorToken: 'categoryErrand' },
  { key: 'service', label: 'Service', icon: 'Wrench', colorToken: 'categoryService' },
  { key: 'digital', label: 'Digital', icon: 'Monitor', colorToken: 'categoryDigital' },
]
