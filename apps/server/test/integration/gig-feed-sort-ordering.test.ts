/**
 * Offset paging over the feed's NON-recency orderings.
 *
 * `sort=amount_*` and relevance both order by a column that ties constantly —
 * a round 25 USDC is the commonest gig amount there is, and `ts_rank` quantises
 * hard. `ORDER BY amount_raw DESC` alone is therefore a PARTIAL order, and
 * postgres is free to return tied rows in a different sequence per query: the
 * planner switches between top-N heapsort sizes as the LIMIT+OFFSET window
 * grows, and the tie order goes with it. LIMIT/OFFSET across such an order
 * shows one row on two pages and never shows another.
 *
 * Measured before the tiebreaker landed, on 200 tied rows read as three pages
 * of 20: 60 rows returned, 58 distinct — one gig on all three pages, two gigs
 * invisible. The web feed's pager (apps/web FeedPager) is what made this
 * reachable: a sorted view had no paging at all before it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escrows, gig_details } from '@tenda/shared/db/schema'
import { escrowFixture } from '../helpers/fixtures'
import {
  TEST_ASSET,
  TEST_CHAIN_ID,
  TEST_DB_CONFIGURED,
  createUser,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** Enough rows that the planner changes its mind about the tie order. */
const TIED_ROWS = 200
const PAGE = 20
const PAGES_READ = 3

/** One creator, N open gigs, every one of them the same amount. */
async function seedTiedGigs(): Promise<string[]> {
  const app = getApp()
  const creator = await createUser(app)
  const rows = Array.from({ length: TIED_ROWS }, (_, index) =>
    escrowFixture({
      creator_id: creator.row.id,
      status: 'open',
      chain_id: TEST_CHAIN_ID,
      asset: TEST_ASSET,
      amount_raw: '25000000',
      accept_deadline: new Date(Date.now() + 86_400_000),
      created_at: new Date(Date.UTC(2026, 0, 1) + index * 60_000),
    }),
  )
  await app.db.insert(escrows).values(rows)
  await app.db.insert(gig_details).values(
    rows.map((row) => ({
      escrow_id: row.id,
      title: `Tiled bathroom job ${row.id}`,
      description: 'Tied amount, distinct row.',
      category: 'service' as const,
      country: 'NG',
      city: 'Lagos',
      remote: false,
      cross_border: false,
    })),
  )
  return rows.map((row) => row.id)
}

/** Read `PAGES_READ` consecutive offset pages of one feed query. */
async function readPages(query: string): Promise<string[]> {
  const app = getApp()
  const seen: string[] = []
  for (let page = 0; page < PAGES_READ; page += 1) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/gigs?${query}&limit=${PAGE}&offset=${page * PAGE}`,
    })
    assert.strictEqual(res.statusCode, 200)
    seen.push(...res.json().data.map((gig: { escrow_id: string }) => gig.escrow_id))
  }
  return seen
}

for (const sort of ['amount_desc', 'amount_asc'] as const) {
  test(`sort=${sort} pages tied amounts without duplicating or skipping`, { skip }, async () => {
    await seedTiedGigs()
    const seen = await readPages(`sort=${sort}`)

    assert.strictEqual(seen.length, PAGE * PAGES_READ, 'every page must be full')
    assert.strictEqual(
      new Set(seen).size,
      seen.length,
      `${sort} returned the same gig on more than one page — the ordering is not total`,
    )
  })
}

test('relevance ordering pages tied ranks without duplicating or skipping', { skip }, async () => {
  await seedTiedGigs()
  // Every row shares the title stem, so every row shares a ts_rank.
  const seen = await readPages('q=bathroom')

  assert.strictEqual(seen.length, PAGE * PAGES_READ, 'every page must be full')
  assert.strictEqual(
    new Set(seen).size,
    seen.length,
    'search returned the same gig on more than one page — the ordering is not total',
  )
})

test('the tiebreaker does not disturb the ordering it breaks ties within', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const rows = [
    escrowFixture({ creator_id: creator.row.id, status: 'open', chain_id: TEST_CHAIN_ID, asset: TEST_ASSET, amount_raw: '1000000', accept_deadline: new Date(Date.now() + 86_400_000) }),
    escrowFixture({ creator_id: creator.row.id, status: 'open', chain_id: TEST_CHAIN_ID, asset: TEST_ASSET, amount_raw: '9000000', accept_deadline: new Date(Date.now() + 86_400_000) }),
    escrowFixture({ creator_id: creator.row.id, status: 'open', chain_id: TEST_CHAIN_ID, asset: TEST_ASSET, amount_raw: '5000000', accept_deadline: new Date(Date.now() + 86_400_000) }),
  ]
  await app.db.insert(escrows).values(rows)
  await app.db.insert(gig_details).values(
    rows.map((row) => ({
      escrow_id: row.id,
      title: 'Distinct amounts',
      description: 'x',
      category: 'service' as const,
      country: 'NG',
      city: 'Lagos',
      remote: false,
      cross_border: false,
    })),
  )

  const cheapest = await app.inject({ method: 'GET', url: '/v1/gigs?sort=amount_asc' })
  assert.deepStrictEqual(
    cheapest.json().data.map((gig: { amount_raw: string }) => gig.amount_raw),
    ['1000000', '5000000', '9000000'],
  )
  const dearest = await app.inject({ method: 'GET', url: '/v1/gigs?sort=amount_desc' })
  assert.deepStrictEqual(
    dearest.json().data.map((gig: { amount_raw: string }) => gig.amount_raw),
    ['9000000', '5000000', '1000000'],
  )
})
