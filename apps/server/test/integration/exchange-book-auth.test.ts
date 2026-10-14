/**
 * GET /v1/exchange and GET /v1/exchange/:id are ANONYMOUS reads (#179).
 *
 * This file is the REWRITE of the one that pinned the opposite. It is not a
 * deletion, and the distinction matters: what made the old file worth having
 * was that the gate could not change without a test changing with it, and that
 * property has to survive the reversal. So the same two directions are pinned,
 * inverted — a stranger reads the book, and reads a listing — and the things
 * that must NOT have moved are pinned beside them.
 *
 * The history, so nobody reads this as drift: #112 closed 2026-09-08 concluding
 * the 401 was intentional, resting on decision #14. It was intentional. It was
 * also not doing its stated job — `POST /v1/agent/register` mints a bearer from
 * a fresh wallet at 10/min and MAX_PAGINATION_LIMIT is 100, so the gate cost a
 * scraper about two minutes. What made the exposure real was the money-movement
 * PAIRING on each row, and #175 removed it. Opening the feed is retiring a
 * control that was not working, not abandoning one that was.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes, type ExchangeDetail, type ExchangeSummary } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const detailUrl = (id: string) => apiRoutes.exchange.get.replace(':id', id)

/**
 * One live sell offer, so a 200 below is a book with a row in it, not an empty
 * one. `overrides` is typed from `createEscrow` itself rather than loosely, so
 * a column that stops existing breaks here instead of silently doing nothing.
 */
type EscrowOverrides = Partial<Parameters<typeof createEscrow>[1]>

async function liveOffer(seller: TestUser, overrides: EscrowOverrides = {}) {
  const app = getApp()
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    ...overrides,
  })
  await attachExchangeDetails(app, escrow.id)
  return escrow
}

test('GET /v1/exchange: an ANONYMOUS caller gets the book', { skip }, async () => {
  const app = getApp()
  const offer = await liveOffer(await createUser(app))

  const res = await app.inject({ method: 'GET', url: apiRoutes.exchange.list })
  assert.strictEqual(res.statusCode, 200, res.body)
  const ids = res.json<{ data: ExchangeSummary[] }>().data.map((r) => r.escrow_id)
  assert.ok(ids.includes(offer.id), 'the book must answer a caller with no token at all')
})

test('GET /v1/exchange: a signed-in reader still sees the same book', { skip }, async () => {
  // The direction the old file pinned, kept: opening a feed must not close it
  // for the people who already had it.
  const app = getApp()
  const offer = await liveOffer(await createUser(app))
  const browser = await createUser(app)
  assert.strictEqual(browser.row.advanced_mode_enabled, false, 'the fixture must be an ordinary user')

  const res = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.list,
    headers: authHeader(browser.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  const ids = res.json<{ data: ExchangeSummary[] }>().data.map((r) => r.escrow_id)
  assert.ok(ids.includes(offer.id), 'browsing stays open to every signed-in user')
})

/**
 * The new arm of the visibility rule (#179). A direct-invite offer can only be
 * accepted by its assignee — the server 403s everyone else — so listing it was
 * already offering a stranger a button that cannot work. Anonymous, it would
 * publish a private invitation. The gig feed has always excluded these.
 */
test('GET /v1/exchange: a DIRECT-INVITE offer is not in the public book', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const invitee = await createUser(app)
  const open = await liveOffer(seller)
  const invited = await liveOffer(seller, { assigned_counterparty_id: invitee.row.id })

  const res = await app.inject({ method: 'GET', url: apiRoutes.exchange.list })
  assert.strictEqual(res.statusCode, 200, res.body)
  const ids = res.json<{ data: ExchangeSummary[] }>().data.map((r) => r.escrow_id)
  assert.ok(ids.includes(open.id), 'the control offer must still be listed')
  assert.ok(!ids.includes(invited.id), 'a private invitation reached the public book')

  // Not even for the invitee — the book is one public document, not a
  // per-reader one. They reach it by its id, which the next case proves.
  const asInvitee = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.list,
    headers: authHeader(invitee.token),
  })
  const inviteeIds = asInvitee.json<{ data: ExchangeSummary[] }>().data.map((r) => r.escrow_id)
  assert.ok(!inviteeIds.includes(invited.id), 'the book is not personalised')
})

test('GET /v1/exchange/:id: the invitee still reaches their offer by id', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const invitee = await createUser(app)
  const invited = await liveOffer(seller, { assigned_counterparty_id: invitee.row.id })

  const res = await app.inject({
    method: 'GET',
    url: detailUrl(invited.id),
    headers: authHeader(invitee.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  const detail = res.json<ExchangeDetail>()
  assert.strictEqual(detail.is_assigned, true)
  assert.strictEqual(detail.assigned_counterparty_id, invitee.row.id, 'the invitee may see who is invited')
})

test('GET /v1/exchange/:id: an ANONYMOUS caller gets the listing, and nothing private', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    counterparty_id: buyer.row.id,
    kind: 'exchange',
    status: 'accepted',
  })
  await attachExchangeDetails(app, escrow.id)

  const res = await app.inject({ method: 'GET', url: detailUrl(escrow.id) })
  assert.strictEqual(res.statusCode, 200, res.body)

  const detail = res.json<ExchangeDetail>()
  // The listing half is public.
  assert.strictEqual(detail.escrow_id, escrow.id)
  assert.ok(detail.rate.length > 0)
  // The private half is NOT, and this is the assertion #179 must never lose:
  // `payout_account` is the seller's bank details.
  assert.strictEqual(detail.payout_account, null, 'the seller payout account reached a stranger')
  assert.strictEqual(detail.counterparty, null)
  assert.strictEqual(detail.payment_proof_url, null)
  assert.strictEqual(detail.my_signer_address, null)
  assert.strictEqual(detail.assigned_counterparty_id, null)
  assert.deepStrictEqual(detail.proofs, [])
  assert.strictEqual(detail.dispute, null)
  // And the creator is still abbreviated (#175) — anonymous is not entitled.
  assert.strictEqual(detail.creator.full_name, null)
  assert.strictEqual(detail.creator.avatar_url, null)
})

test('GET /v1/exchange/:id: a DRAFT is 404 to a stranger, not 401', { skip }, async () => {
  // A 401 would confirm the id exists. The gig detail draws this line the same
  // way and for the same reason.
  const app = getApp()
  const seller = await createUser(app)
  const draft = await createEscrow(getApp(), {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'draft',
  })
  await attachExchangeDetails(app, draft.id)

  const anon = await app.inject({ method: 'GET', url: detailUrl(draft.id) })
  assert.strictEqual(anon.statusCode, 404, anon.body)

  const stranger = await createUser(app)
  const other = await app.inject({
    method: 'GET',
    url: detailUrl(draft.id),
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(other.statusCode, 404)

  const owner = await app.inject({
    method: 'GET',
    url: detailUrl(draft.id),
    headers: authHeader(seller.token),
  })
  assert.strictEqual(owner.statusCode, 200, 'the creator still reads their own draft')
})

test('GET /v1/exchange/:id: a TAKEN-DOWN offer stays 404 to a stranger and visible to its party', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const hidden = await liveOffer(seller, { hidden: true })

  const anon = await app.inject({ method: 'GET', url: detailUrl(hidden.id) })
  assert.strictEqual(anon.statusCode, 404, anon.body)

  const stranger = await createUser(app)
  const other = await app.inject({
    method: 'GET',
    url: detailUrl(hidden.id),
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(other.statusCode, 404)

  const owner = await app.inject({
    method: 'GET',
    url: detailUrl(hidden.id),
    headers: authHeader(seller.token),
  })
  assert.strictEqual(owner.statusCode, 200, 'a party keeps reading it — the escrow may be mid-flight')
})

/**
 * `identifyViewer` treats an unreadable bearer as ABSENT. That is the property
 * that stops a stale session turning a public page into an error — the gig
 * route's recorded reason, and now this one's.
 */
test('GET /v1/exchange: a junk bearer reads as anonymous, not 401', { skip }, async () => {
  const app = getApp()
  const offer = await liveOffer(await createUser(app))

  for (const url of [apiRoutes.exchange.list, detailUrl(offer.id)]) {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: 'Bearer not-a-jwt' } })
    assert.strictEqual(res.statusCode, 200, `${url} answered ${res.statusCode}: ${res.body}`)
  }
})
