/**
 * Gig categories — DERIVED from @tenda/shared's category registry, the same
 * one mobile and web render from.
 *
 * THIS FILE REPLACES A HAND-KEPT COPY THAT CONTRADICTED TWO PRODUCT
 * DECISIONS, both recorded in shared's own docstrings:
 *
 *   - It labelled `photo` "Photo". Shared labels it "Creative", and says why:
 *     mobile once shipped both spellings for the same category and the
 *     consolidation existed to end that. The landing had quietly reopened it.
 *   - It carried icons `Truck` / `Footprints` / `Code`. Shared carries
 *     `Bike` / `ShoppingBag` / `Laptop` from the 2026-08-15 decision that the
 *     product is micro-tasks — "'Bike' not 'Truck', 'Laptop' not 'Monitor'".
 *     The landing was rendering the icons that decision rejected.
 *
 * Neither was reachable by a test, because a copy agrees with itself.
 *
 * EMOJI IS THE ONE LOCAL EXTRA, and it is a landing-only display choice — the
 * chips here are emoji where the apps use lucide glyphs. It follows the
 * convention `chains.ts` already sets: marketing extras keyed by the shared
 * vocabulary, nothing else decided locally. The Record is TOTAL over
 * `GigCategory`, so a category added to shared fails this file's compile
 * instead of rendering a chip with a hole in it.
 */

import {
  GIG_CATEGORIES,
  CATEGORY_LABELS,
  type GigCategory,
} from '@tenda/shared/constants/categories'
import { prose } from '@/lib/prose'

export { GIG_CATEGORIES }

export type CategoryId = GigCategory

export interface CategoryMeta {
  id: CategoryId
  /** Shared's product-wide label — not restated here. */
  label: string
  emoji: string
}

/** Landing-only chip glyphs, keyed by the shared vocabulary. */
const CATEGORY_EMOJI: Record<GigCategory, string> = {
  delivery: '📦',
  photo: '📸',
  errand: '🏃',
  // U+FE0F is load-bearing: U+1F6E0 is Emoji_Presentation=No, so without the
  // variation selector it renders as a monochrome text glyph beside four
  // colour emoji. The deleted copy had the same bug.
  service: '🛠️',
  digital: '💻',
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = Object.fromEntries(
  GIG_CATEGORIES.map((id) => [
    id,
    { id, label: CATEGORY_LABELS[id], emoji: CATEGORY_EMOJI[id] },
  ]),
) as Record<CategoryId, CategoryMeta>

/**
 * "delivery, creative, errand, service and digital" — the set for RUNNING
 * PROSE, where middots read as a UI stamp rather than a sentence. Mirrors
 * CHAIN_NAMES_PROSE in chains.ts.
 *
 * This exists because the §03 gigs panel hand-listed its categories in body
 * copy as "delivery, photo, errands, services, digital" — printing `photo`,
 * the raw enum key, directly beside chips reading "Creative". One page, one
 * category, two names: exactly the split shared's CATEGORY_LABELS was
 * consolidated to end.
 *
 * Lower-cased because these are common nouns inside a sentence; the labels
 * keep their title case wherever they are rendered as chips.
 */
export const CATEGORY_LABELS_PROSE = prose(
  GIG_CATEGORIES.map((id) => CATEGORY_LABELS[id].toLowerCase()),
)
