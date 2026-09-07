/**
 * Escrow, gig and exchange refusals that no test executed (#105 T2).
 *
 * Nine guards across six route files, gathered here rather than scattered into
 * six suites: each is one case, and the files that would otherwise host them
 * (exchange-p2p at 888 lines, gigs-listing at 441) are already the two the
 * 300-line rule is straining against. What they have in common is the subject —
 * the ways these surfaces say no — so they read better together than as one
 * more case appended to six unrelated files.
 *
 * TWO OF THEM ARE PRIVACY, not validation:
 *   exchange/_id:54  a DRAFT offer must 404 to anyone but its creator. A draft
 *                    is an unfunded, unpublished intention; leaking it exposes
 *                    what a user is about to trade and at what price.
 *   escrows/_id/transactions:25  the on-chain transaction log is party-only.
 *
 * The rest refuse a request the surface cannot honour, and each names its own
 * field or state — every one of these routes answers several statuses, so a
 * status-only assertion could not say which guard fired.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { MAX_REVIEW_COMMENT_LENGTH } from '@tenda/shared'
import {
  ABSENT_UUID,
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  attachExchangeDetails,
  authHeader,
} from '../helpers/test-app'
import { partiedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- exchange detail: existence and draft privacy ----------------------

test('GET /v1/exchange/:id: an offer that does not exist is 404', { skip }, async () => {
  const app = getApp()
  const reader = await createUser(app)
  const res = await app.inject({
    method: 'GET', url: `/v1/exchange/${ABSENT_UUID}`, headers: authHeader(reader.token),
  })
  assert.strictEqual(res.statusCode, 404)
  assert.match(res.json().message, /Exchange offer not found/)
})

test('GET /v1/exchange/:id: a DRAFT offer is 404 to anyone but its creator', { skip }, async () => {
  // Privacy, not bookkeeping: a draft is an unpublished intention to trade at a
  // price. It answers 404 rather than 403 on purpose — a 403 would confirm the
  // offer exists.
  const app = getApp()
  const seller = await createUser(app)
  const stranger = await createUser(app)
  const draft = await createEscrow(app, { creator_id: seller.row.id, kind: 'exchange' })
  await attachExchangeDetails(app, draft.id)

  const theirs = await app.inject({
    method: 'GET', url: `/v1/exchange/${draft.id}`, headers: authHeader(stranger.token),
  })
  assert.strictEqual(theirs.statusCode, 404)
  assert.match(theirs.json().message, /Exchange offer not found/)

  // ...and the creator sees their own draft, so the 404 is the privacy rule
  // rather than drafts being unreadable.
  const mine = await app.inject({
    method: 'GET', url: `/v1/exchange/${draft.id}`, headers: authHeader(seller.token),
  })
  assert.strictEqual(mine.statusCode, 200)
})

// ---------- escrow transaction log: party only --------------------------------

test('GET /v1/escrows/:id/transactions: a stranger has no role and is 403', { skip }, async () => {
  const app = getApp()
  const { escrow, creator } = await partiedEscrow(app, 'accepted')
  const stranger = await createUser(app)

  const denied = await app.inject({
    method: 'GET', url: `/v1/escrows/${escrow.id}/transactions`, headers: authHeader(stranger.token),
  })
  assert.strictEqual(denied.statusCode, 403)
  assert.match(denied.json().message, /no role on escrow/)

  const allowed = await app.inject({
    method: 'GET', url: `/v1/escrows/${escrow.id}/transactions`, headers: authHeader(creator.token),
  })
  assert.strictEqual(allowed.statusCode, 200)
})

// ---------- review: the two guards past the party check ------------------------

test('POST /v1/escrows/:id/review: an over-long comment is 400', { skip }, async () => {
  // The party and score guards were covered; the comment bound was not. It is a
  // column limit, so without it an over-long comment reaches postgres.
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'completed')

  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/review`, headers: authHeader(creator.token),
    payload: { score: 5, comment: 'x'.repeat(MAX_REVIEW_COMMENT_LENGTH + 1) },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /comment must be at most/)

  // Exactly at the bound is legal — an off-by-one here refuses a valid review.
  const atBound = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/review`, headers: authHeader(creator.token),
    payload: { score: 5, comment: 'x'.repeat(MAX_REVIEW_COMMENT_LENGTH) },
  })
  assert.strictEqual(atBound.statusCode, 201, atBound.body)
})

test('POST /v1/escrows/:id/review: a completed escrow with no counterparty is 400', { skip }, async () => {
  // There is nobody to review. The route derives the reviewee as "the other
  // party", which is null here, and refuses rather than inserting a review with
  // a null subject. Reachable because completion is a status, and a resolved or
  // completed escrow can lose its counterparty (or never have had one) without
  // the row becoming invalid.
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'completed' })

  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/review`, headers: authHeader(creator.token),
    payload: { score: 5 },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /Cannot determine reviewee/)
})

// ---------- refund: only from the two statuses that have one -------------------

test('POST /v1/escrows/:id/refund: a status with no refund path is 409, naming it', { skip }, async () => {
  // `open` refunds an expired escrow and `accepted` reclaims an abandoned one.
  // Every other status has no refund transition at all, and the message carries
  // the status so a client can say why.
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'completed')

  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/refund`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 409)
  assert.match(res.json().message, /refund not available from status 'completed'/)
})

// ---------- dispute: permits are an EVM concept --------------------------------

test('POST /v1/escrows/:id/dispute: a permit on a non-EVM chain is 422', { skip }, async () => {
  // The harness chain is Solana, and EIP-2612 permits have no meaning there.
  // Forwarding one would reach an adapter that cannot use it; the guard refuses
  // it while it can still name the chain.
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'accepted')

  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/dispute`, headers: authHeader(creator.token),
    payload: {
      reason: 'The delivered work does not match what was agreed at all.',
      bond_raw: '1000000',
      // The WIRE permit shape — { value_raw, deadline_unix, signature } — taken
      // from validateWirePermit, which runs BEFORE the namespace check. A
      // malformed permit is refused by its own validator first, so this one has
      // to be well-formed for the chain guard to be the thing that fires.
      // The v byte must be a REAL recovery id (0x1b = 27), so that the parse
      // succeeds and this case stays about the CHAIN guard. A v out of range
      // used to 500 — viem threw past the shape check and the handler could not
      // classify it — which is #107, fixed: it is now the same 422 with a
      // different message, pinned in permit-refusals.test.ts.
      permit: {
        value_raw: '1000000',
        deadline_unix: Math.floor(Date.now() / 1000) + 3600,
        signature: `0x${'1'.repeat(64)}${'2'.repeat(64)}1b`,
      },
    },
  })
  assert.strictEqual(res.statusCode, 422, res.body)
  assert.match(res.json().message, /permit is not supported on/)
})

// ---------- gig detail attach + applications ----------------------------------

test('POST /v1/gigs: a missing escrow_id is 400', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)

  for (const escrow_id of [undefined, '', 42]) {
    const res = await app.inject({
      method: 'POST', url: '/v1/gigs', headers: authHeader(u.token),
      payload: { escrow_id, title: 'Paint my fence', category: 'service' },
    })
    assert.strictEqual(res.statusCode, 400, String(escrow_id))
    assert.match(res.json().message, /escrow_id is required/)
  }
})

test('POST /v1/gigs/:id/applications: a gig that has left `open` is 409', { skip }, async () => {
  // The loader checks kind, listing and approval mode but NOT status, so this
  // guard is the only thing stopping an application against a gig that has
  // already been accepted — which would be dead on arrival.
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id, status: 'accepted', requires_approval: true,
  })
  await attachGigDetails(app, escrow.id, { title: 'Already taken' })

  const res = await app.inject({
    method: 'POST', url: `/v1/gigs/${escrow.id}/applications`, headers: authHeader(worker.token),
    payload: { message: 'I can do this today.' },
  })
  assert.strictEqual(res.statusCode, 409)
  assert.match(res.json().message, /no longer taking applications/)
})

// ---------- the creator-row invariant, deliberately NOT tested -----------------

test('GET /v1/exchange/:id: an accepted offer still resolves both parties', { skip }, async () => {
  // The control for the two `escrow creator row missing` 500s at
  // exchange/_id:86 and gigs/_id:118. Those are defence-in-depth against a
  // broken FK: `creator_id` references `users`, and the query that builds the
  // map selects exactly the ids the row carries, so the lookup cannot miss
  // unless the database has lost referential integrity. Reaching them would
  // mean corrupting the schema rather than exercising the product, so they stay
  // uncovered on purpose — and this case pins the path they guard.
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const offer = await createEscrow(app, {
    creator_id: seller.row.id, kind: 'exchange', status: 'accepted', counterparty_id: buyer.row.id,
  })
  await attachExchangeDetails(app, offer.id)

  const res = await app.inject({
    method: 'GET', url: `/v1/exchange/${offer.id}`, headers: authHeader(buyer.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().creator.id, seller.row.id)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, offer.id))
  assert.strictEqual(row.counterparty_id, buyer.row.id)
})
