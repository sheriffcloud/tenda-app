/**
 * `chain_id` list filter across every browse surface that exposes it:
 *   GET /v1/gigs              (public feed AND ?mine= own-listings path)
 *   GET /v1/exchange          (order book)
 *   GET /v1/users/:id/escrows (my trades / my escrows)
 *
 * The contract under test is deliberately narrow but exact:
 *   - filtering discriminates, and `total` reflects the FILTER, not the
 *     unfiltered row count (a count query that forgets the condition is the
 *     classic way this breaks — pagination then pages into nothing);
 *   - an unregistered-but-well-formed CAIP-2 id is a 400, never a silently
 *     empty page that reads to a user as "no gigs on this chain";
 *   - a REGISTERED chain with no rows IS an empty page (200), because that
 *     is a legitimate state, not an error;
 *   - an empty `?chain_id=` is "no filter", not a 400 — clients serialise a
 *     cleared filter that way all the time.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_CHAIN_ID_ALT,
  TEST_ASSET_ALT,
  UNREGISTERED_CHAIN_ID,
  useTestApp,
  seedAltChain,
  createUser,
  createEscrow,
  attachGigDetails,
  attachExchangeDetails,
  authHeader,
} from '../helpers/test-app'
import { openGig } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const ids = (body: { data: { escrow_id: string }[] }) => body.data.map((r) => r.escrow_id)

// ---------- GET /v1/gigs (public feed) -------------------------------------

test('gigs feed: chain_id returns only that chain, and total follows the filter', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const { escrow: onDefault } = await openGig(app, { title: 'Solana gig' })
  const { escrow: onAlt } = await openGig(app, {
    title: 'Base gig',
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })

  const unfiltered = await app.inject({ method: 'GET', url: '/v1/gigs' })
  assert.strictEqual(unfiltered.json().total, 2, 'both gigs are visible without a filter')

  const res = await app.inject({ method: 'GET', url: `/v1/gigs?chain_id=${TEST_CHAIN_ID_ALT}` })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.deepStrictEqual(ids(body), [onAlt.id])
  // The count query must carry the same WHERE as the row query — if it
  // doesn't, this reads 2 and the client pages into an empty second page.
  assert.strictEqual(body.total, 1)

  const other = await app.inject({ method: 'GET', url: `/v1/gigs?chain_id=${TEST_CHAIN_ID}` })
  assert.deepStrictEqual(ids(other.json()), [onDefault.id])
  assert.strictEqual(other.json().total, 1)
})

test('gigs feed: unregistered chain_id is a 400, not an empty page', { skip }, async () => {
  const app = getApp()
  await openGig(app)
  const res = await app.inject({ method: 'GET', url: `/v1/gigs?chain_id=${UNREGISTERED_CHAIN_ID}` })
  assert.strictEqual(res.statusCode, 400)
  // The message lists what IS accepted, mirroring country/category.
  assert.match(res.json().message, /chain_id must be one of/)
})

test('gigs feed: registered chain with no rows is an empty 200, not an error', { skip }, async () => {
  const app = getApp()
  await openGig(app) // default chain only — alt is registered but unseeded
  const res = await app.inject({ method: 'GET', url: `/v1/gigs?chain_id=${TEST_CHAIN_ID_ALT}` })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json().data, [])
  assert.strictEqual(res.json().total, 0)
})

test('gigs feed: empty chain_id means no filter', { skip }, async () => {
  const app = getApp()
  await openGig(app)
  await openGig(app)
  const res = await app.inject({ method: 'GET', url: '/v1/gigs?chain_id=' })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().total, 2)
})

test('gigs feed: chain_id composes with the other filters (AND, not OR)', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  // Same category on both chains, plus a same-chain row in another category.
  const { escrow: wanted } = await openGig(app, {
    category: 'delivery',
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })
  await openGig(app, { category: 'delivery' })
  await openGig(app, { category: 'service', chain_id: TEST_CHAIN_ID_ALT, asset: TEST_ASSET_ALT })

  const res = await app.inject({
    method: 'GET',
    url: `/v1/gigs?chain_id=${TEST_CHAIN_ID_ALT}&category=delivery`,
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(ids(res.json()), [wanted.id])
  assert.strictEqual(res.json().total, 1)
})

// ---------- GET /v1/gigs?mine= (own listings) -------------------------------

test('gigs ?mine=created: chain_id filters own listings incl. drafts', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const owner = await createUser(app)

  const altDraft = await createEscrow(app, {
    creator_id: owner.row.id,
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })
  await attachGigDetails(app, altDraft.id, { title: 'Base draft' })
  const defaultDraft = await createEscrow(app, { creator_id: owner.row.id })
  await attachGigDetails(app, defaultDraft.id, { title: 'Solana draft' })

  const res = await app.inject({
    method: 'GET',
    url: `/v1/gigs?mine=created&chain_id=${TEST_CHAIN_ID_ALT}`,
    headers: authHeader(owner.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(ids(res.json()), [altDraft.id])
  assert.strictEqual(res.json().total, 1)
})

test('gigs ?mine=: an unregistered chain_id still 400s (auth path)', { skip }, async () => {
  const app = getApp()
  const owner = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/gigs?mine=created&chain_id=${UNREGISTERED_CHAIN_ID}`,
    headers: authHeader(owner.token),
  })
  assert.strictEqual(res.statusCode, 400)
})

// ---------- GET /v1/exchange (order book) -----------------------------------

async function openOffer(
  app: ReturnType<typeof getApp>,
  creator_id: string,
  chain_id?: string,
  asset?: string,
) {
  const escrow = await createEscrow(app, {
    creator_id,
    kind: 'exchange',
    status: 'open',
    ...(chain_id === undefined ? {} : { chain_id }),
    ...(asset === undefined ? {} : { asset }),
  })
  await attachExchangeDetails(app, escrow.id)
  return escrow
}

test('exchange order book: chain_id filters offers and total', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const seller = await createUser(app)
  const onAlt = await openOffer(app, seller.row.id, TEST_CHAIN_ID_ALT, TEST_ASSET_ALT)
  await openOffer(app, seller.row.id)

  const res = await app.inject({
    method: 'GET',
    url: `/v1/exchange?chain_id=${TEST_CHAIN_ID_ALT}`,
    headers: authHeader(seller.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(ids(res.json()), [onAlt.id])
  assert.strictEqual(res.json().total, 1)
})

test('exchange order book: unregistered chain_id 400s', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/exchange?chain_id=${UNREGISTERED_CHAIN_ID}`,
    headers: authHeader(seller.token),
  })
  assert.strictEqual(res.statusCode, 400)
})

test('exchange order book: chain_id composes with the currency filter', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const seller = await createUser(app)
  const altNgn = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })
  await attachExchangeDetails(app, altNgn.id, { fiat_currency: 'NGN' })
  const altKes = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })
  await attachExchangeDetails(app, altKes.id, { fiat_currency: 'KES' })
  await openOffer(app, seller.row.id) // default chain, NGN

  const res = await app.inject({
    method: 'GET',
    url: `/v1/exchange?chain_id=${TEST_CHAIN_ID_ALT}&currency=NGN`,
    headers: authHeader(seller.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(ids(res.json()), [altNgn.id])
  assert.strictEqual(res.json().total, 1)
})

// ---------- GET /v1/users/:id/escrows (my trades) ---------------------------

test('user escrows: chain_id filters both sides of the caller\'s escrows', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const me = await createUser(app)
  const other = await createUser(app)

  // One as creator on the alt chain, one as counterparty on the alt chain,
  // one on the default chain — the filter must keep the first two.
  const mineCreated = await createEscrow(app, {
    creator_id: me.row.id,
    kind: 'exchange',
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })
  const mineTaken = await createEscrow(app, {
    creator_id: other.row.id,
    counterparty_id: me.row.id,
    kind: 'exchange',
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
  })
  await createEscrow(app, { creator_id: me.row.id, kind: 'exchange' })

  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${me.row.id}/escrows?kind=exchange&chain_id=${TEST_CHAIN_ID_ALT}`,
    headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const returned = res.json().data.map((r: { id: string }) => r.id).sort()
  assert.deepStrictEqual(returned, [mineCreated.id, mineTaken.id].sort())
  assert.strictEqual(res.json().total, 2)
})

test('user escrows: unregistered chain_id 400s before any row work', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${me.row.id}/escrows?chain_id=${UNREGISTERED_CHAIN_ID}`,
    headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 400)
})

test('user escrows: chain_id does not widen access to another user', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  // The ownership guard must still win — a filter is not an authorisation.
  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${other.row.id}/escrows?chain_id=${TEST_CHAIN_ID}`,
    headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 403)
})
