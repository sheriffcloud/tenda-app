export const GIG_CATEGORIES = [
  'delivery',
  'photo',
  'errand',
  'service',
  'digital',
] as const

export type GigCategory = (typeof GIG_CATEGORIES)[number]

/**
 * Product-wide display labels for gig categories — shared so mobile and web
 * cannot label the same category differently ('photo' reads "Creative" on
 * purpose). Icon NAMES are shared too (CATEGORY_META below); only the
 * name→component resolution is per-client, because lucide import paths
 * differ by platform.
 */
export const CATEGORY_LABELS: Record<GigCategory, string> = {
  delivery: 'Delivery',
  photo:    'Creative',
  errand:   'Errand',
  service:  'Service',
  digital:  'Digital',
}

// ── Category display registry ─────────────────────────────────────────

export type CategoryColorToken =
  | 'categoryDelivery'
  | 'categoryPhoto'
  | 'categoryErrand'
  | 'categoryService'
  | 'categoryDigital'

export interface CategoryMeta {
  key: GigCategory
  label: string
  /** Lucide icon NAME — each client resolves it against its own lucide package. */
  icon: string
  colorToken: CategoryColorToken
}

/**
 * Display registry for gig categories (feed grid, cards, detail body, filter
 * sheets — mobile AND web). Labels come from CATEGORY_LABELS above so a
 * category can never read differently across surfaces again: before this
 * consolidation mobile shipped BOTH 'Photo' (cards/filters, via its local
 * lib/categories.ts) and 'Creative' (the create-flow CategoryGrid) for the
 * same category.
 *
 * Icons are the LIGHTER lucide glyphs on purpose (user decision 2026-08-15):
 * the product is micro-tasks, so 'Bike' not 'Truck', 'Laptop' not 'Monitor'.
 * Clients resolve these names against their own lucide package and must fail
 * loudly on an unmapped name rather than falling back silently.
 */
export const CATEGORY_META: CategoryMeta[] = [
  { key: 'delivery', label: CATEGORY_LABELS.delivery, icon: 'Bike', colorToken: 'categoryDelivery' },
  { key: 'photo', label: CATEGORY_LABELS.photo, icon: 'Camera', colorToken: 'categoryPhoto' },
  { key: 'errand', label: CATEGORY_LABELS.errand, icon: 'ShoppingBag', colorToken: 'categoryErrand' },
  { key: 'service', label: CATEGORY_LABELS.service, icon: 'Wrench', colorToken: 'categoryService' },
  { key: 'digital', label: CATEGORY_LABELS.digital, icon: 'Laptop', colorToken: 'categoryDigital' },
]

/**
 * Narrowing guard for a category read back from the database or the wire.
 *
 * `gig_details.category` is a `text` column, not a pg enum, so "a category" is
 * a claim about a string rather than something the type system already knows —
 * exactly the position `isCountryCode` occupies for `LOCATIONS`. Aggregates
 * that GROUP BY the column need it to drop a value outside the vocabulary
 * instead of passing an unrenderable key to a client keyed by `GigCategory`.
 */
export function isGigCategory(value: string): value is GigCategory {
  return (GIG_CATEGORIES as readonly string[]).includes(value)
}

/**
 * Resolve the registry's icon NAMES against a client's own icon components,
 * producing the per-category map every category surface reads.
 *
 * Generic in the component type because that is the only part that differs:
 * web imports from `lucide-react` and mobile from `lucide-react-native`, so
 * the COMPONENTS must stay per client while the loop, the fail-at-module-load
 * contract and the error copy live here (#43) — both clients had written this
 * function character-identically apart from the import path.
 *
 * Driven off CATEGORY_META rather than hand-keyed by category, so a renamed
 * icon in this file throws at the client's module load instead of drifting.
 * That loud failure is the contract CATEGORY_META's docstring states; keeping
 * it beside the registry means the file that states it also enforces it.
 *
 * Throws, deliberately, rather than falling back to a placeholder glyph: a
 * silently untinted or missing icon is precisely the defect that let the old
 * Truck/Monitor vs Bike/Laptop split survive unnoticed.
 */
export function resolveCategoryIconMap<T>(
  iconsByName: Readonly<Record<string, T>>,
): Record<GigCategory, T> {
  const icons = {} as Record<GigCategory, T>
  for (const meta of CATEGORY_META) {
    const icon = iconsByName[meta.icon]
    if (icon === undefined) {
      throw new Error(
        `resolveCategoryIconMap: no icon for "${meta.icon}" (category "${meta.key}") — add it to the client's icon registry`,
      )
    }
    icons[meta.key] = icon
  }
  return icons
}
