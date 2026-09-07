/**
 * GET /v1/gigs/facets — the feed rail's counts.
 *
 * Two properties matter more than any individual number:
 *   1. a cell's count equals what CLICKING that cell returns from /v1/gigs
 *      (the rail must never point at a page of a different size), and
 *   2. "public" means the same thing here as on the feed — the two share
 *      publicGigConditions, and these tests are what proves the sharing is
 *      real rather than two lists that happen to agree today.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GIG_CATEGORIES, LOCATIONS } from '@tenda/shared'
import type { GigFacets } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
} from '../helpers/test-app'
import { openGig } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type App = ReturnType<typeof getApp>

async function facets(app: App, query = ''): Promise<GigFacets> {
  const res = await app.inject({ method: 'GET', url: `/v1/gigs/facets${query}` })
  assert.equal(res.statusCode, 200)
  return res.json()
}

async function feedTotal(app: App, query = ''): Promise<number> {
  const res = await app.inject({ method: 'GET', url: `/v1/gigs${query}` })
  assert.equal(res.statusCode, 200)
  return res.json().total
}

// ---------- the counts themselves ----------------------------------------

test('counts each category and reports 0 for the ones with no gigs', { skip }, async () => {
  const app = getApp()
  await openGig(app, { category: 'delivery' })
  await openGig(app, { category: 'delivery' })
  await openGig(app, { category: 'photo' })

  const { category } = await facets(app)

  assert.equal(category.delivery, 2)
  assert.equal(category.photo, 1)
  // Every cell the rail draws needs a number. A missing key renders blank,
  // which reads as "loading" rather than "none".
  assert.deepEqual(Object.keys(category).sort(), [...GIG_CATEGORIES].sort())
  assert.equal(category.errand, 0)
  assert.equal(category.service, 0)
  assert.equal(category.digital, 0)
})

test('counts every served market, and remote gigs belong to none of them', { skip }, async () => {
  const app = getApp()
  await openGig(app, { country: 'NG' })
  await openGig(app, { country: 'KE' })
  // Remote gigs persist no country — they are in the feed but in no market.
  await openGig(app, { details: { remote: true, country: null, city: null } })

  const { country, remote } = await facets(app)

  assert.equal(country.NG, 1)
  assert.equal(country.KE, 1)
  assert.equal(country.GH, 0)
  assert.deepEqual(Object.keys(country).sort(), Object.keys(LOCATIONS).sort())
  // The market counts sum to 2 while the feed holds 3: the null-country row is
  // deliberately in no bucket, which is why "all markets" is not their sum.
  assert.equal(Object.values(country).reduce((a, b) => a + b, 0), 2)
  assert.equal(remote, 1)
})

test('counts the arrangement toggles independently of each other', { skip }, async () => {
  const app = getApp()
  await openGig(app, { details: { remote: true, country: null, city: null } })
  await openGig(app, { details: { cross_border: true } })
  await openGig(app, {})

  const { remote, cross_border } = await facets(app)

  assert.equal(remote, 1)
  assert.equal(cross_border, 1)
})

// ---------- the number must match the page it leads to --------------------

test('every category count equals what clicking that category returns', { skip }, async () => {
  const app = getApp()
  await openGig(app, { category: 'delivery', country: 'NG' })
  await openGig(app, { category: 'delivery', country: 'KE' })
  await openGig(app, { category: 'photo', country: 'NG' })
  await openGig(app, { category: 'errand', country: 'NG' })

  // Under an ACTIVE country filter, which is the case that breaks a naive
  // implementation: the counts must still be scoped by country while being
  // blind to the category the reader is currently on.
  const { category } = await facets(app, '?country=NG&category=photo')

  for (const key of GIG_CATEGORIES) {
    const clicked = await feedTotal(app, `?country=NG&category=${key}`)
    assert.equal(category[key], clicked, `category=${key} count must match the feed`)
  }
  assert.equal(category.delivery, 1)
})

test('the arrangement counts equal what toggling them returns', { skip }, async () => {
  const app = getApp()
  await openGig(app, { details: { remote: true, country: null, city: null } })
  await openGig(app, { details: { remote: true, country: null, city: null } })
  await openGig(app, { details: { cross_border: true } })

  // Asked while remote is ALREADY on: the count must describe the toggle, not
  // the current view, or the cell that is on would be the only non-zero one.
  const withRemoteOn = await facets(app, '?remote=true')

  assert.equal(withRemoteOn.remote, await feedTotal(app, '?remote=true'))
  assert.equal(withRemoteOn.cross_border, await feedTotal(app, '?remote=true&cross_border=true'))
  assert.equal(withRemoteOn.cross_border, 0)
})

test('a facet lifts ONLY its own key — an active city still scopes the markets', { skip }, async () => {
  const app = getApp()
  await openGig(app, { country: 'NG', details: { city: 'Lagos' } })
  await openGig(app, { country: 'NG', details: { city: 'Abuja' } })

  // The rail's market links carry `city` through (gigsHref swaps one key), so
  // a market count that ignored the city would advertise 2 and deliver 1.
  const { country } = await facets(app, '?country=NG&city=Lagos')

  assert.equal(country.NG, 1)
  assert.equal(country.NG, await feedTotal(app, '?country=NG&city=Lagos'))
})

test('the counts respect the SEARCH TERM as well as the filters', { skip }, async () => {
  const app = getApp()
  await openGig(app, { category: 'delivery', title: 'Tiling a bathroom floor' })
  await openGig(app, { category: 'photo', title: 'Tiling a kitchen wall' })
  await openGig(app, { category: 'delivery', title: 'Walk my dog twice' })

  // `q` is not a facet, so it is never lifted — a rail that counted the whole
  // feed while the reader is looking at search results is the most visible way
  // these numbers can lie, and it rides the same queryConditions call as every
  // other non-facet filter.
  const { category } = await facets(app, '?q=tiling')

  assert.equal(category.delivery, 1)
  assert.equal(category.photo, 1)
  assert.equal(category.delivery, await feedTotal(app, '?q=tiling&category=delivery'))
})

// ---------- "public" means what it means on the feed -----------------------

test('the counts obey the feed visibility rule, row for row', { skip }, async () => {
  const app = getApp()
  const assignee = await createUser(app)
  const { escrow: visible } = await openGig(app, { category: 'delivery' })
  const { creator } = await openGig(app, { category: 'delivery' })

  // Each of these is public-looking in one column and excluded by another.
  const draft = await createEscrow(app, { creator_id: creator.row.id })
  await attachGigDetails(app, draft.id, { category: 'delivery' })
  const expired = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: new Date(Date.now() - 60_000),
  })
  await attachGigDetails(app, expired.id, { category: 'delivery' })
  await openGig(app, { category: 'delivery', escrow: { hidden: true } })
  await openGig(app, {
    category: 'delivery',
    escrow: { assigned_counterparty_id: assignee.row.id },
  })

  const { category } = await facets(app)

  assert.equal(category.delivery, 2)
  assert.equal(category.delivery, await feedTotal(app, '?category=delivery'))
  assert.ok(visible.id)
})

test('a gig with NO accept deadline is counted, not silently dropped', { skip }, async () => {
  const app = getApp()
  // The deadline rule is `accept_deadline IS NULL OR accept_deadline > now`.
  // Written as the plain comparison — which is how the endpoint was specified
  // — every open-ended gig would vanish from the rail while staying in the
  // list beside it.
  await openGig(app, { category: 'service', escrow: { accept_deadline: null } })

  const { category } = await facets(app)

  assert.equal(category.service, 1)
  assert.equal(category.service, await feedTotal(app, '?category=service'))
})

test('an exchange escrow is not a gig and is counted by neither surface', { skip }, async () => {
  const app = getApp()
  // Pins the OUTCOME, and deliberately not the mechanism: what excludes this
  // row is the gig_details inner join (an exchange escrow has no such row),
  // not `kind='gig'` — removing that condition leaves this test green. Both
  // guards are real and the note in public-feed.ts says why the redundant one
  // stays. If a future caller drops the join, this is what still fails.
  await openGig(app, { category: 'service' })
  const creator = await createUser(app)
  await createEscrow(app, { creator_id: creator.row.id, status: 'open', kind: 'exchange' })

  const { category } = await facets(app)

  assert.equal(category.service, 1)
  assert.equal(await feedTotal(app), 1)
})

// ---------- refusals -------------------------------------------------------

test('facets refuse the filters that are not public-feed concepts', { skip }, async () => {
  const app = getApp()
  for (const query of ['?mine=created', '?mine=working', '?status=open']) {
    const res = await app.inject({ method: 'GET', url: `/v1/gigs/facets${query}` })
    assert.equal(res.statusCode, 400, `${query} must be refused`)
  }
})

test('facets refuse every invalid FILTER the feed refuses', { skip }, async () => {
  const app = getApp()
  // A lifted key is no longer validated, so an invalid category could sail
  // through the very facet that ignores it. Both surfaces must answer 400.
  for (const query of ['?category=plumbing', '?country=BOGUS', '?chain_id=eip155:99999', '?min_amount_raw=1.5']) {
    const railed = await app.inject({ method: 'GET', url: `/v1/gigs/facets${query}` })
    const listed = await app.inject({ method: 'GET', url: `/v1/gigs${query}` })
    assert.equal(railed.statusCode, 400, `${query} must be refused by facets`)
    assert.equal(listed.statusCode, 400, `${query} must be refused by the feed`)
  }
})

test('a PAGING key is ignored here, not refused as the feed refuses it', { skip }, async () => {
  const app = getApp()
  await openGig(app, { category: 'delivery' })

  // The one place the two surfaces deliberately disagree, pinned so it reads as
  // a decision rather than an oversight. The feed 400s a malformed cursor
  // because it would page from a row it cannot decode; a count has no position,
  // so there is nothing for a cursor to break. Refusing it would only punish a
  // caller who forwarded their whole querystring, and the count it gets is
  // right either way. `GigFacetsQuery` omits the paging keys for this reason.
  const railed = await app.inject({ method: 'GET', url: '/v1/gigs/facets?cursor=garbage' })
  const listed = await app.inject({ method: 'GET', url: '/v1/gigs?cursor=garbage' })

  assert.equal(railed.statusCode, 200)
  assert.equal(railed.json().category.delivery, 1)
  assert.equal(listed.statusCode, 400)
})

test('facets report the SAME refusal as the feed when two filters are invalid', { skip }, async () => {
  const app = getApp()
  // Which of several 400s a caller is told about is behaviour, not arrangement
  // (see list-filters' note on refusal order). The facets route validates the
  // caller's UNMODIFIED query once for exactly this reason: each per-facet
  // rebuild lifts one key, so the category facet does not check `category`,
  // and letting the rebuilds do the validating would answer the amount error
  // here while the feed answers the category one.
  const query = '?category=plumbing&min_amount_raw=1.5'
  const railed = await app.inject({ method: 'GET', url: `/v1/gigs/facets${query}` })
  const listed = await app.inject({ method: 'GET', url: `/v1/gigs${query}` })

  assert.equal(railed.statusCode, 400)
  assert.equal(listed.statusCode, 400)
  assert.equal(railed.json().message, listed.json().message)
  assert.match(railed.json().message, /category must be one of/)
})

test('facets answer an empty database with zeros rather than an error', { skip }, async () => {
  const app = getApp()
  const body = await facets(app)

  assert.equal(body.remote, 0)
  assert.equal(body.cross_border, 0)
  for (const key of GIG_CATEGORIES) assert.equal(body.category[key], 0)
})
