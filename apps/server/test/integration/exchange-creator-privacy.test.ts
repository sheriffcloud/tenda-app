/**
 * Who the exchange surface says posted an offer (#175).
 *
 * An offer row pairs a person with the money they are moving and a clock. A
 * full legal name and a face beside that is the approach P2P fraud actually
 * uses — off-platform, mid-window. So the book shows "Wisdom A.", a rating and
 * a country; the legal name and the avatar wait for a SETTLED party, the line
 * `payout_account` already sits behind on this very route.
 *
 * The cases that matter are the NEGATIVE ones: the surname and the avatar must
 * not reach a caller who is not entitled to them, and asserting on the SERIALISED
 * body rather than on parsed fields is what catches a leak through a key nobody
 * thought to check.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abbreviatedName, apiRoutes, type ExchangeDetail, type ExchangeSummary } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  attachExchangeDetails,
  authHeader,
  createEscrow,
  createUser,
  useTestApp,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const SELLER = { first_name: 'Wisdom', last_name: 'Abioye', avatar_url: 'https://cdn.example/face.jpg' }

/** One open offer from a seller whose name and face are both set. */
async function openOffer(): Promise<{ seller: TestUser; escrowId: string }> {
  const app = getApp()
  const seller = await createUser(app, SELLER)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(app, escrow.id)
  return { seller, escrowId: escrow.id }
}

test('the BOOK shows an abbreviated name, and never the surname or the face', { skip }, async () => {
  const app = getApp()
  await openOffer()
  const reader = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.list,
    headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)

  const [offer] = res.json<{ data: ExchangeSummary[] }>().data
  assert.ok(offer !== undefined, 'the book served no offer to assert on')
  assert.strictEqual(offer.creator.display_name, abbreviatedName(SELLER.first_name, SELLER.last_name))
  assert.strictEqual(offer.creator.full_name, null)
  assert.strictEqual(offer.creator.avatar_url, null)

  // On the RAW body: a leak through any key at all fails here, including one
  // added later that nobody thought to assert on.
  assert.ok(!res.body.includes(SELLER.last_name), 'the surname reached the book')
  assert.ok(!res.body.includes(SELLER.avatar_url), 'the avatar reached the book')
  // The trust signals a counterparty actually decides on must survive.
  assert.strictEqual(typeof offer.creator.is_agent, 'boolean')
  assert.ok('review_score' in offer.creator && 'country' in offer.creator)
})

test('the DETAIL withholds the name and face from a signed-in stranger', { skip }, async () => {
  const app = getApp()
  const { escrowId } = await openOffer()
  const stranger = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.get.replace(':id', escrowId),
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)

  const detail = res.json<ExchangeDetail>()
  assert.strictEqual(detail.creator.full_name, null)
  assert.strictEqual(detail.creator.avatar_url, null)
  assert.strictEqual(detail.creator.display_name, 'Wisdom A.')
  assert.ok(!res.body.includes(SELLER.last_name), 'the surname reached a stranger')
})

test('the DETAIL gives the name and face to the SETTLED counterparty', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app, SELLER)
  const buyer = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    counterparty_id: buyer.row.id,
    kind: 'exchange',
    status: 'accepted',
  })
  await attachExchangeDetails(app, escrow.id)

  const res = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.get.replace(':id', escrow.id),
    headers: authHeader(buyer.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)

  const detail = res.json<ExchangeDetail>()
  assert.strictEqual(detail.creator.full_name, 'Wisdom Abioye')
  assert.strictEqual(detail.creator.avatar_url, SELLER.avatar_url)
  // The abbreviation is still there — a client may keep showing it in a list.
  assert.strictEqual(detail.creator.display_name, 'Wisdom A.')
})

/**
 * The boundary between the two party predicates, and the reason the reveal uses
 * `isEscrowPartyRow` rather than the `isEscrowPartyOrAssignedRow` that guards
 * the private half: a PENDING assignee has been offered the trade and has not
 * taken it. `payout_account` already draws the line here; the identity follows.
 */
test('a PENDING assignee is not yet entitled to the name or the face', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app, SELLER)
  const invitee = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    assigned_counterparty_id: invitee.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(app, escrow.id)

  const res = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.get.replace(':id', escrow.id),
    headers: authHeader(invitee.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)

  const detail = res.json<ExchangeDetail>()
  assert.strictEqual(detail.creator.full_name, null, 'a pending assignee read the seller name')
  assert.strictEqual(detail.creator.avatar_url, null, 'a pending assignee read the seller avatar')
  assert.ok(!res.body.includes(SELLER.last_name))
})

/**
 * Both name columns default to `''`, so "no profile name" is reachable without
 * a null anywhere. The label must come back empty rather than as stray
 * punctuation — a lone "." beside a money figure reads as a rendering bug.
 */
test('a seller with no profile name gets an empty label, not punctuation', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app, { first_name: '', last_name: '' })
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(app, escrow.id)
  const reader = await createUser(app)

  const res = await app.inject({
    method: 'GET',
    url: apiRoutes.exchange.get.replace(':id', escrow.id),
    headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.strictEqual(res.json<ExchangeDetail>().creator.display_name, '')
})
