import { Bike, Camera, Laptop, ShoppingBag, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CATEGORY_META, resolveCategoryIconMap, type GigCategory } from '@tenda/shared'

/**
 * The web resolution of shared CATEGORY_META icon NAMES to lucide components.
 *
 * Only the REGISTRY is web's: the loop, the fail-at-module-load contract and
 * the error copy live in shared's `resolveCategoryIconMap` (#43), because this
 * file and mobile's twin held them character-identically apart from the lucide
 * package name. Building the map from the registry rather than hand-keying it
 * by category is what makes a renamed icon in shared fail HERE at module load
 * instead of drifting — which is exactly how the old Truck/Monitor vs
 * Bike/Laptop split survived: the names lived in dead metadata nobody resolved.
 */
const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  Bike,
  Camera,
  ShoppingBag,
  Wrench,
  Laptop,
}

export const CATEGORY_ICONS: Record<GigCategory, LucideIcon> =
  resolveCategoryIconMap(LUCIDE_BY_NAME)

/**
 * The comps' `row.tone` drawn directly — a list row's leading glyph, a filter
 * rail's dot. The `-base` family, not the badge's surface/text/border trio
 * (see CategoryBadge): these are drawn IN the tone rather than placed on it.
 *
 * Both class names for one category live in one entry so a new category needs
 * one edit and cannot be half-added. Hand-keyed because Tailwind needs whole
 * class names at build time, and guarded below so a missing entry fails at
 * module load like a missing icon does, rather than rendering an untinted
 * glyph nobody notices.
 */
export interface CategoryTone {
  /** Foreground for a glyph. */
  text: string
  /** Fill for a dot or swatch. */
  dot: string
}

const TONE_CLASSES: Record<GigCategory, CategoryTone> = {
  delivery: { text: 'text-category-delivery-base', dot: 'bg-category-delivery-base' },
  photo: { text: 'text-category-photo-base', dot: 'bg-category-photo-base' },
  errand: { text: 'text-category-errand-base', dot: 'bg-category-errand-base' },
  service: { text: 'text-category-service-base', dot: 'bg-category-service-base' },
  digital: { text: 'text-category-digital-base', dot: 'bg-category-digital-base' },
}

for (const meta of CATEGORY_META) {
  if (TONE_CLASSES[meta.key] === undefined) {
    throw new Error(
      `category-icons: no tone for category "${meta.key}" — add it to TONE_CLASSES`,
    )
  }
}

export const CATEGORY_TONE: Record<GigCategory, CategoryTone> = TONE_CLASSES
