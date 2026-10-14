/**
 * Mobile's icon REGISTRY resolves — every name shared's CATEGORY_META asks for
 * has a lucide-react-native component behind it.
 *
 * This exists because nothing else on mobile loaded the module. The resolver
 * throws at module load by design, and web has three suites that import it
 * incidentally and go red; mobile had none, so a name added to CATEGORY_META
 * with no matching entry here would have shipped as a crash on first render of
 * the category grid with a fully green CI (measured while moving the resolver
 * into shared, #43: renaming 'Bike' to 'Bicycle' failed 3 web suites and 0 of
 * mobile's 199).
 */
import { CATEGORY_META, GIG_CATEGORIES } from '@tenda/shared'
import { CATEGORY_ICONS } from '@/components/gig/category-icons'

test('every category has a real icon component, one per category', () => {
  expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...GIG_CATEGORIES].sort())
  for (const category of GIG_CATEGORIES) {
    expect(CATEGORY_ICONS[category]).toBeDefined()
    // A component, not a leaked string or the name it was resolved from.
    expect(typeof CATEGORY_ICONS[category]).not.toBe('string')
  }
})

test('distinct categories get distinct glyphs — the registry is not collapsing', () => {
  // Guards a registry where every name accidentally maps to one component:
  // the map would still be total, and every category would look identical.
  const glyphs = new Set(CATEGORY_META.map((meta) => CATEGORY_ICONS[meta.key]))
  expect(glyphs.size).toBe(CATEGORY_META.length)
})
