/**
 * GET /v1/exchange — the amount window (#100).
 *
 * The order book accepts `min_amount_raw`/`max_amount_raw` and guards them with
 * three refusals that no test executed: both bounds must be canonical decimal
 * integer strings, and the window must not be inverted. Delete any of them and
 * the suite stayed green.
 *
 * These are QUERY parameters on a route every authenticated user can call, and
 * `isAmountRaw` plus a BigInt comparison are the only things between them and
 * `gte`/`lte` against a numeric(78,0) column — which is why they are worth
 * executing rather than assuming.
 *
 * THE TWIN. The gigs feed takes the same two params and, since #101, runs the
 * SAME guard: `amountWindowConditions` in lib/amount-window. That is what makes
 * this file's job narrow — the rule itself is proved once, in
 * unit/amount-window.test.ts, over every input including the ones no route
 * happens to send today. What is proved HERE is what only a route can show:
 * that this route calls the guard at all, that it calls it in the right
 * POSITION among its sibling filters, that the messages reach the client, and
 * that `total` reflects the window rather than the unfiltered count. A unit
 * test cannot stand in for any of those, and the gigs side has its own set for
 * the same reason (gigs-listing.test.ts).
 *
 * Messages are asserted, not just statuses. Every guard on this route answers
 * 400 VALIDATION_ERROR, so a status-only assertion cannot tell which one fired
 * — the lesson #98 measured on this route's POST rails, where five assertions
 * were satisfied by a guard other than the one they named.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  UNREGISTERED_CHAIN_ID,
  useTestApp,
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** A live sell offer of a given size — the order book only lists open, unhidden rows. */
async function offerOf(app: ReturnType<typeof getApp>, seller: TestUser, amount_raw: string) {
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    amount_raw,
  })
  await attachExchangeDetails(app, escrow.id)
  return escrow
}

/** The order book keys its rows by `escrow_id`, not `id` (EXCHANGE_SUMMARY_COLS). */
const ids = (body: { data: { escrow_id: string }[] }) => body.data.map((r) => r.escrow_id)

const SMALL = '1000000'
const LARGE = '9000000'

test('exchange order book: the window filters the page AND the total', { skip }, async () => {
  // `total` comes from a SECOND query. A count that forgets the window reads as
  // a page of 1 out of 2, and pagination then pages into nothing — the same
  // property chain-filter.test.ts pins for chain_id.
  const app = getApp()
  const seller = await createUser(app)
  const reader = await createUser(app)
  await offerOf(app, seller, SMALL)
  const large = await offerOf(app, seller, LARGE)

  const res = await app.inject({
    method: 'GET',
    url: '/v1/exchange?min_amount_raw=5000000',
    headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(ids(res.json()), [large.id])
  assert.strictEqual(res.json().total, 1)
})

test('exchange order book: an upper bound excludes the offers above it', { skip }, async () => {
  // The max half of the window, which has its own guard and its own condition.
  // Without this case `lte` could be dropped entirely and only the min side
  // would notice.
  const app = getApp()
  const seller = await createUser(app)
  const reader = await createUser(app)
  const small = await offerOf(app, seller, SMALL)
  await offerOf(app, seller, LARGE)

  const res = await app.inject({
    method: 'GET',
    url: '/v1/exchange?max_amount_raw=5000000',
    headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(ids(res.json()), [small.id])
  assert.strictEqual(res.json().total, 1)
})

test('exchange order book: each malformed bound is refused by name', { skip }, async () => {
  // One case per guard, each naming its own field — the three refusals differ
  // only in their message. '1.5' and '-5' are well-formed numbers that are not
  // canonical amount_raw; '007' has leading zeros; the inverted window is two
  // valid bounds in the wrong order.
  const app = getApp()
  const reader = await createUser(app)
  const cases: [string, RegExp][] = [
    ['?min_amount_raw=1.5', /min_amount_raw must be a decimal integer/],
    ['?min_amount_raw=-5', /min_amount_raw must be a decimal integer/],
    ['?max_amount_raw=007', /max_amount_raw must be a decimal integer/],
    ['?max_amount_raw=abc', /max_amount_raw must be a decimal integer/],
    ['?min_amount_raw=10&max_amount_raw=9', /min_amount_raw must be ≤ max_amount_raw/],
  ]
  for (const [query, expected] of cases) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/exchange${query}`,
      headers: authHeader(reader.token),
    })
    assert.strictEqual(res.statusCode, 400, query)
    assert.match(res.json().message, expected, query)
  }
})

test('exchange order book: an unregistered chain is reported BEFORE the window', { skip }, async () => {
  // Position, not style. Both guards answer 400 and differ only in their
  // message, so which runs first is the whole of what a caller is told — and
  // that is invisible to a status assertion. The gigs feed pins its entire
  // sequence this way ('the filter guards refuse in a FIXED order'); this route
  // had no such case, so the ordering comment at its call site was asserting
  // something no test held up. Found by reading the call site during #100's
  // audit, not by the suite going red.
  const app = getApp()
  const reader = await createUser(app)

  const res = await app.inject({
    method: 'GET',
    url: `/v1/exchange?chain_id=${UNREGISTERED_CHAIN_ID}&min_amount_raw=1.5`,
    headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /chain_id must be one of/)
})

test('exchange order book: the window is compared numerically, not as text', { skip }, async () => {
  // '9' > '10' lexicographically, so a string compare would refuse this
  // legitimate window. The guard parses BigInts precisely to avoid that, and
  // nothing on this route proved it until now.
  const app = getApp()
  const reader = await createUser(app)

  const res = await app.inject({
    method: 'GET',
    url: '/v1/exchange?min_amount_raw=9&max_amount_raw=10',
    headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 200)
})
