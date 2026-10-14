import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORY_LABELS,
  CATEGORY_META,
  GIG_CATEGORIES,
  isGigCategory,
  resolveCategoryIconMap,
} from '../../src/constants/categories'

/** A stand-in for a client's lucide components — the resolver is generic. */
const ALL_ICONS: Record<string, string> = Object.fromEntries(
  CATEGORY_META.map((meta) => [meta.icon, `<${meta.icon}/>`]),
)

test('GIG_CATEGORIES: non-empty, duplicate-free, all lowercase slugs', () => {
  assert.ok(GIG_CATEGORIES.length > 0)
  assert.equal(new Set(GIG_CATEGORIES).size, GIG_CATEGORIES.length)
  for (const c of GIG_CATEGORIES) assert.match(c, /^[a-z]+$/)
})

test('CATEGORY_LABELS: every category has a non-empty label, and photo reads "Creative"', () => {
  for (const category of GIG_CATEGORIES) {
    assert.equal(typeof CATEGORY_LABELS[category], 'string')
    assert.notEqual(CATEGORY_LABELS[category], '')
  }
  assert.equal(CATEGORY_LABELS.photo, 'Creative')
})

test('CATEGORY_META: one entry per category, labels sourced from CATEGORY_LABELS', () => {
  assert.deepEqual(CATEGORY_META.map((meta) => meta.key), [...GIG_CATEGORIES])
  for (const meta of CATEGORY_META) {
    assert.equal(meta.label, CATEGORY_LABELS[meta.key])
    assert.notEqual(meta.icon, '')
    assert.match(meta.colorToken, /^category[A-Z]/)
  }
})

test('CATEGORY_META: pins the micro-task-weight icon decision (Bike not Truck, Laptop not Monitor)', () => {
  const iconOf = (key: string) => CATEGORY_META.find((meta) => meta.key === key)?.icon
  assert.equal(iconOf('delivery'), 'Bike')
  assert.equal(iconOf('digital'), 'Laptop')
  assert.equal(iconOf('photo'), 'Camera')
  assert.equal(iconOf('errand'), 'ShoppingBag')
  assert.equal(iconOf('service'), 'Wrench')
})

test('isGigCategory: accepts every member of the vocabulary and nothing else', () => {
  for (const category of GIG_CATEGORIES) assert.equal(isGigCategory(category), true)
  // The shapes a `text` column can actually hold: a retired slug, a near miss,
  // a display label mistaken for a key, casing, whitespace, and empty.
  for (const value of ['taxidermy', 'deliveries', 'Creative', 'Delivery', ' delivery', '']) {
    assert.equal(isGigCategory(value), false)
  }
})

test('isGigCategory: narrows, so a checked string indexes CATEGORY_LABELS', () => {
  // The reason it exists rather than a cast — an aggregate reads the column
  // back as `string` and has to reach the label without asserting the type.
  const fromTheDatabase: string = 'photo'
  assert.equal(isGigCategory(fromTheDatabase) ? CATEGORY_LABELS[fromTheDatabase] : null, 'Creative')
})

test('resolveCategoryIconMap: keys the client registry by category, one entry each', () => {
  const icons = resolveCategoryIconMap(ALL_ICONS)
  assert.deepEqual(Object.keys(icons), [...GIG_CATEGORIES])
  for (const meta of CATEGORY_META) {
    assert.equal(icons[meta.key], ALL_ICONS[meta.icon])
  }
})

test('resolveCategoryIconMap: throws naming the icon AND the category it belongs to', () => {
  // The failure the clients cannot test for themselves: theirs runs at module
  // load, so a missing name takes the whole bundle down before any test body.
  const { Bike: _dropped, ...missingDelivery } = ALL_ICONS
  // Both halves in one pattern — the icon a client must add AND the category
  // it belongs to, so the message is actionable without opening the registry.
  assert.throws(
    () => resolveCategoryIconMap(missingDelivery),
    /"Bike" \(category "delivery"\)/,
  )
})

test('resolveCategoryIconMap: an empty registry fails on the FIRST category, not silently', () => {
  // Not `deepEqual({}, ...)`: the whole point is that a client which forgot the
  // registry entirely gets a throw rather than a map of undefined glyphs.
  assert.throws(() => resolveCategoryIconMap({}), /no icon for/)
})

test('resolveCategoryIconMap: a registry with EXTRA names is fine — only CATEGORY_META drives it', () => {
  // Clients legitimately share one icon registry with other surfaces.
  const icons = resolveCategoryIconMap({ ...ALL_ICONS, Truck: '<Truck/>', Monitor: '<Monitor/>' })
  assert.deepEqual(Object.keys(icons), [...GIG_CATEGORIES])
})

test('resolveCategoryIconMap: a registry entry that is present but undefined still throws', () => {
  // `in`-checking would accept this; the resolver checks the VALUE, because an
  // undefined component renders nothing rather than failing loudly.
  const icons: Record<string, string | undefined> = { ...ALL_ICONS, Camera: undefined }
  assert.throws(() => resolveCategoryIconMap(icons), /"Camera".*"photo"/)
})
