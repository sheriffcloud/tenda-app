/**
 * scripts/post-gigs/gigs — the seed book's SHAPE, not its prose.
 *
 * Every consumer takes a prefix: `--limit 5` for a small mainnet run, and any
 * run the rate limiter cuts short. When the book was grouped by country each of
 * those prefixes was one country — the first ten gigs were all Nigerian. These
 * tests hold the interleave so that regrouping cannot land unnoticed.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { GIG_BOOK } from '@server/scripts/post-gigs/gigs'

/**
 * The brief: a seed book has to show the marketplace working across LMICs, not
 * in one country. Four is the floor that was asked for; the book currently
 * carries five, and the prefix test below is what keeps them visible.
 */
const MIN_COUNTRIES = 4

/** What a small run posts — the mainnet slice and the useful demo. */
const PREFIX = 5

const onSite = GIG_BOOK.filter((g) => g.remote !== true)
const countriesOf = (gigs: readonly { country?: string }[]): Set<string> =>
  new Set(gigs.flatMap((g) => (g.country === undefined ? [] : [g.country])))

test('the book covers at least the required number of countries', () => {
  assert.ok(
    countriesOf(GIG_BOOK).size >= MIN_COUNTRIES,
    `book covers ${countriesOf(GIG_BOOK).size} countries, brief requires ${MIN_COUNTRIES}`,
  )
})

test('the first five gigs are five different countries', () => {
  // The regression that prompted this: grouped by country, the first five were
  // five Nigerian gigs and a five-gig mainnet run showed one country.
  const prefix = GIG_BOOK.slice(0, PREFIX)
  const countries = countriesOf(prefix)
  assert.equal(
    countries.size,
    PREFIX,
    `first ${PREFIX} cover ${[...countries].join(', ')} — expected ${PREFIX} distinct`,
  )
})

test('every country in the book appears within the first half', () => {
  // The real round-robin property, and the one the old grouped order failed
  // outright: grouped by country the first ten gigs were ten Nigerian ones and
  // four countries did not appear until gig 11.
  //
  // Deliberately NOT a per-country cap. Nigeria is half the book by design —
  // it is the launch market — so any cap tight enough to be meaningful is one
  // the data cannot satisfy. "Everyone is visible early" is the honest
  // invariant, and it is the one a regrouping breaks.
  const all = countriesOf(GIG_BOOK)
  const early = countriesOf(GIG_BOOK.slice(0, PREFIX * 2))
  const missing = [...all].filter((c) => !early.has(c))
  assert.deepEqual(missing, [], `absent from the first ${PREFIX * 2}: ${missing.join(', ')}`)
})

test('every on-site gig names both a country and a city', () => {
  // A geotag gig with no city cannot be sanity-checked by a human reading the
  // book, and the radius is measured from a coordinate nobody can place.
  for (const g of onSite) {
    assert.ok(g.country !== undefined && g.country !== '', `on-site gig has no country: ${g.title}`)
    assert.ok(g.city !== undefined && g.city !== '', `on-site gig has no city: ${g.title}`)
  }
})

test('remote gigs claim no location', () => {
  // Remote work has nowhere to be; a country on a remote gig would filter it
  // out of every other country's feed for no reason.
  for (const g of GIG_BOOK.filter((x) => x.remote === true)) {
    assert.equal(g.country, undefined, `remote gig declares a country: ${g.title}`)
    assert.equal(g.city, undefined, `remote gig declares a city: ${g.title}`)
  }
})

test('every gig is distinct — no entry duplicated by a bad reorder', () => {
  // The interleave was applied by moving whole entries; dropping or doubling
  // one is the way that goes wrong, and it is invisible in a diff this size.
  const titles = GIG_BOOK.map((g) => g.title)
  assert.equal(new Set(titles).size, titles.length, 'duplicate title in GIG_BOOK')
})
