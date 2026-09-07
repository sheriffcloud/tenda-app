/**
 * GET /v1/gigs/:id and GET /v1/exchange/:id — who gets the PRIVATE half.
 *
 * Both routes stay readable by design (a share link and a push deep-link must
 * both land on something), and that was being read as "everything hanging off
 * the listing is public too": the counterparty's profile, the proof-of-work
 * files, the dispute reason, the buyer's fiat receipt. A subscriber who tapped
 * a "New Gig Posted" notification days later opened a gig someone else was
 * working on and read all of it.
 *
 * The positives here are as load-bearing as the negatives. Withholding is easy
 * to over-apply, and a worker who cannot see their own gig's brief is a worse
 * bug than the leak.
 *
 * Disclosure is PARTY-based and reads no role: the gig route is reached
 * through `identifyViewer` (a bare jwtVerify), whose role claim is up to a
 * 7-day token lifetime stale. Admins read evidence through the dossier — see
 * the module header on lib/escrow-detail-scope.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { disputes, escrow_proofs, escrows, reviews } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  createBankAccount,
  attachGigDetails,
  attachExchangeDetails,
  authHeader,
  type TestUser,
} from '../helpers/test-app'
import { proofUrl } from '../helpers/escrow-states'
import type { EscrowRow } from '../helpers/fixtures'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type App = ReturnType<typeof getApp>

const DISPUTE_REASON = 'The delivered work does not match the brief'

async function addProof(app: App, escrow_id: string, user_id: string): Promise<void> {
  await app.db
    .insert(escrow_proofs)
    .values({ escrow_id, url: proofUrl(user_id, 1), type: 'image' })
}

async function addDispute(app: App, escrow_id: string, raised_by: string): Promise<void> {
  await app.db.insert(disputes).values({ escrow_id, raised_by, reason: DISPUTE_REASON })
}

async function addReview(app: App, escrow_id: string, from: string, to: string): Promise<void> {
  await app.db
    .insert(reviews)
    .values({ escrow_id, reviewer_id: from, reviewee_id: to, score: 5, comment: 'Great work' })
}

interface WorkedGig {
  poster: TestUser
  worker: TestUser
  escrow: EscrowRow
}

/**
 * The worst case in one row: a gig under dispute, so the counterparty, a proof
 * file, a dispute reason and a review are ALL populated at once. Every field
 * the scoping touches is therefore non-empty, which is what makes an assertion
 * of `null` / `[]` meaningful rather than vacuously true.
 */
async function disputedGig(app: App, overrides: Partial<EscrowRow> = {}): Promise<WorkedGig> {
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
    ...overrides,
  })
  await attachGigDetails(app, escrow.id, { title: 'Fix the roof' })
  await addProof(app, escrow.id, worker.row.id)
  await addDispute(app, escrow.id, poster.row.id)
  await addReview(app, escrow.id, poster.row.id, worker.row.id)
  return { poster, worker, escrow }
}

const gigDetail = (app: App, id: string, token?: string) =>
  app.inject({
    method: 'GET',
    url: `/v1/gigs/${id}`,
    ...(token === undefined ? {} : { headers: authHeader(token) }),
  })

/** Everything an outsider must NOT receive, asserted in one place. */
function assertWithheld(body: Record<string, unknown>): void {
  assert.strictEqual(body.counterparty, null)
  assert.deepStrictEqual(body.proofs, [])
  assert.strictEqual(body.dispute, null)
}

/** Everything a party MUST receive. */
function assertDisclosed(body: Record<string, unknown>, worker_id: string): void {
  const counterparty = body.counterparty as { id: string } | null
  assert.strictEqual(counterparty?.id, worker_id)
  assert.strictEqual((body.proofs as unknown[]).length, 1)
  assert.strictEqual((body.dispute as { reason: string } | null)?.reason, DISPUTE_REASON)
}

// ── /v1/gigs/:id — outsiders ────────────────────────────────────────────────

test('gig detail: an anonymous reader gets the listing, never the work', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedGig(app)

  const res = await gigDetail(app, escrow.id)
  // Also the pin on how the viewer is READ: @fastify/jwt decorates
  // `request.user` as null rather than leaving it absent, so a gate that tests
  // for `undefined` turns every anonymous read into a 500 instead of a
  // withheld one.
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  // The listing itself is unchanged — this route backs every share link.
  assert.strictEqual(body.escrow_id, escrow.id)
  assert.strictEqual(body.title, 'Fix the roof')
  assert.strictEqual(body.status, 'disputed')
  assertWithheld(body)
})

test('gig detail: a signed-in stranger is no better off than an anonymous one', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedGig(app)
  const stranger = await createUser(app)

  const res = await gigDetail(app, escrow.id, stranger.token)
  assert.strictEqual(res.statusCode, 200) // withheld, not refused
  assertWithheld(res.json())
})

test('gig detail: an applicant who was never assigned stays an outsider', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const rival = await createUser(app)
  const chosen = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
  })
  await attachGigDetails(app, escrow.id, {})

  const applied = await app.inject({
    method: 'POST',
    url: `/v1/gigs/${escrow.id}/applications`,
    headers: authHeader(rival.token),
    payload: {},
  })
  assert.strictEqual(applied.statusCode, 201)

  // …and the gig then goes to someone else, who delivers and gets disputed.
  // Written after the apply because the route (rightly) refuses an application
  // to a gig that is no longer open — and populated so the assertions below
  // are about WITHHOLDING rather than about an empty gig.
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: chosen.row.id })
    .where(eq(escrows.id, escrow.id))
  await addProof(app, escrow.id, chosen.row.id)
  await addDispute(app, escrow.id, poster.row.id)

  const body = (await gigDetail(app, escrow.id, rival.token)).json()
  // Applying is asking, not being chosen. The `viewer` block still answers
  // them about their OWN application — that scoping is unaffected.
  assertWithheld(body)
  assert.strictEqual(body.viewer.application.status, 'open')
})

// ── /v1/gigs/:id — parties ──────────────────────────────────────────────────

test('gig detail: the poster sees the worker, the proofs and the dispute', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await disputedGig(app)

  assertDisclosed((await gigDetail(app, escrow.id, poster.token)).json(), worker.row.id)
})

test('gig detail: the worker sees their own escrow in full', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await disputedGig(app)

  assertDisclosed((await gigDetail(app, escrow.id, worker.token)).json(), worker.row.id)
})

test('gig detail: a pending assignee sees it before they have signed anything', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const assignee = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    assigned_counterparty_id: assignee.row.id,
  })
  await attachGigDetails(app, escrow.id, {})
  await addProof(app, escrow.id, poster.row.id)

  const body = (await gigDetail(app, escrow.id, assignee.token)).json()
  // Approval mode assigns them without a signature: if this withheld the
  // brief's evidence they would be working blind on a gig that is already
  // theirs.
  assert.strictEqual(body.assigned_counterparty_id, assignee.row.id)
  assert.strictEqual(body.proofs.length, 1)
})

test('gig detail: admins get the LISTING, and read evidence in the dossier', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedGig(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const owner = await createUser(app, { role: 'super_admin' })

  // Disclosure here is party-based and consults no role — see the module
  // header on escrow-detail-scope. Admins mediate through
  // /v1/admin/escrows/:id/dossier and /v1/admin/disputes, which carry the same
  // proofs, parties and dispute reason behind `requirePermission`.
  assertWithheld((await gigDetail(app, escrow.id, mediator.token)).json())
  assertWithheld((await gigDetail(app, escrow.id, owner.token)).json())
})

test('gig detail: a STALE admin role in a token discloses nothing', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedGig(app)
  // A demoted admin: the DB says `user`, the token they still hold says
  // `dispute_admin`. `identifyViewer` does a bare jwtVerify, so this route
  // never sees the demotion — mobile tokens live 7 days. This is exactly why
  // the disclosure gate takes an id and not a role.
  const demoted = await createUser(app, { role: 'user' })
  const staleToken = app.jwt.sign({ id: demoted.row.id, role: 'dispute_admin' })

  const res = await gigDetail(app, escrow.id, staleToken)
  assert.strictEqual(res.statusCode, 200)
  assertWithheld(res.json())
})

// ── the assignee id, and the flag that replaces it ──────────────────────────

test('gig detail: the assignee id is withheld but `is_assigned` still tells the truth', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const invitee = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    assigned_counterparty_id: invitee.row.id,
  })
  await attachGigDetails(app, escrow.id, {})

  const outsider = (await gigDetail(app, escrow.id, stranger.token)).json()
  // The id is the worker's identity by another name — withholding the
  // `counterparty` object while publishing this would have been theatre.
  assert.strictEqual(outsider.assigned_counterparty_id, null)
  // …but the gig being spoken for is part of the listing, and `canAccept`
  // reads it: without this flag a stranger is offered an Accept button whose
  // transaction both contracts revert.
  assert.strictEqual(outsider.is_assigned, true)

  const party = (await gigDetail(app, escrow.id, poster.token)).json()
  assert.strictEqual(party.assigned_counterparty_id, invitee.row.id)
  assert.strictEqual(party.is_assigned, true)
})

test('gig detail: an unassigned gig reports is_assigned false to everyone', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: poster.row.id, status: 'open' })
  await attachGigDetails(app, escrow.id, {})

  assert.strictEqual((await gigDetail(app, escrow.id)).json().is_assigned, false)
  assert.strictEqual((await gigDetail(app, escrow.id, poster.token)).json().is_assigned, false)
})

test('gig detail: an assignment that survives into `accepted` is still withheld', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'accepted',
    requires_approval: true,
    // Both columns populated at once: `assign_accept` installs the
    // counterparty and leaves the assignment behind.
    counterparty_id: worker.row.id,
    assigned_counterparty_id: worker.row.id,
  })
  await attachGigDetails(app, escrow.id, {})

  const body = (await gigDetail(app, escrow.id, stranger.token)).json()
  // Only `decline` ever clears this column, so a post-accept row keeps naming
  // the worker — the case that made redacting `counterparty` alone useless.
  assert.strictEqual(body.assigned_counterparty_id, null)
  assert.strictEqual(body.counterparty, null)
})

// ── the deliberate carve-out ────────────────────────────────────────────────

test('gig detail: reviews stay public — reputation is public by design', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await disputedGig(app)

  const body = (await gigDetail(app, escrow.id)).json()
  // The same rows /v1/users/:id/reviews already serves on a profile. Hiding
  // them here would not conceal anything, it would only make the two surfaces
  // disagree.
  assert.strictEqual(body.reviews.length, 1)
  assert.strictEqual(body.reviews[0].reviewee_id, worker.row.id)
})

// ── the hidden-row gate (same predicate, refactored) ────────────────────────

test('gig detail: a taken-down gig 404s for outsiders, loads for parties and admins', { skip }, async () => {
  const app = getApp()
  const { poster, worker, escrow } = await disputedGig(app, { hidden: true })
  const stranger = await createUser(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })

  assert.strictEqual((await gigDetail(app, escrow.id)).statusCode, 404)
  assert.strictEqual((await gigDetail(app, escrow.id, stranger.token)).statusCode, 404)
  assert.strictEqual((await gigDetail(app, escrow.id, poster.token)).statusCode, 200)
  assert.strictEqual((await gigDetail(app, escrow.id, worker.token)).statusCode, 200)
  // The takedown gate is the ONE place a role still counts, and it is safe
  // there: this branch runs the full `authenticate`, which re-reads the role
  // from the DB. It admits the admin to the LISTING only — the private half
  // below is still party-scoped.
  const adminView = await gigDetail(app, escrow.id, mediator.token)
  assert.strictEqual(adminView.statusCode, 200)
  assertWithheld(adminView.json())
})

test('gig detail: a taken-down gig ignores a STALE admin role (full authenticate refreshes it)', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedGig(app, { hidden: true })
  const demoted = await createUser(app, { role: 'user' })
  const staleToken = app.jwt.sign({ id: demoted.row.id, role: 'super_admin' })

  // `authenticate` overwrites request.user.role from the DB before the gate
  // reads it, so the hidden branch cannot be opened with a stale claim either.
  assert.strictEqual((await gigDetail(app, escrow.id, staleToken)).statusCode, 404)
})

// ── /v1/exchange/:id ────────────────────────────────────────────────────────

interface DisputedOffer {
  seller: TestUser
  buyer: TestUser
  escrow: EscrowRow
}

/** The exchange twin of `disputedGig`, plus the seller's payout account. */
async function disputedOffer(app: App): Promise<DisputedOffer> {
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const account = await createBankAccount(app, seller.row.id, { account_number: '9988776655' })
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    counterparty_id: buyer.row.id,
    kind: 'exchange',
    status: 'disputed',
  })
  await attachExchangeDetails(app, escrow.id, {
    payout_account_id: account.id,
    payment_proof_url: 'https://res.cloudinary.com/test-cloud/image/upload/receipt.jpg',
  })
  await addProof(app, escrow.id, buyer.row.id)
  await addDispute(app, escrow.id, seller.row.id)
  return { seller, buyer, escrow }
}

const offerDetail = (app: App, id: string, token: string) =>
  app.inject({ method: 'GET', url: `/v1/exchange/${id}`, headers: authHeader(token) })

test('exchange detail: a stranger gets the terms, never the trade', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedOffer(app)
  const stranger = await createUser(app)

  const res = await offerDetail(app, escrow.id, stranger.token)
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  // Price and terms still read — that is what makes an offer browsable.
  assert.strictEqual(body.fiat_currency, 'NGN')
  assertWithheld(body)
  assert.strictEqual(body.payment_proof_url, null)
  assert.strictEqual(body.payout_account, null)
})

test('exchange detail: the two parties see the trade in full', { skip }, async () => {
  const app = getApp()
  const { seller, buyer, escrow } = await disputedOffer(app)

  const sellerView = (await offerDetail(app, escrow.id, seller.token)).json()
  assertDisclosed(sellerView, buyer.row.id)
  assert.ok(sellerView.payment_proof_url !== null)

  const buyerView = (await offerDetail(app, escrow.id, buyer.token)).json()
  assertDisclosed(buyerView, buyer.row.id)
  // The buyer needs the account they are paying INTO — the narrower gate.
  assert.strictEqual(buyerView.payout_account.account_number, '9988776655')
})

test('exchange detail: a pending assignee is a party for the trade, NOT for the bank details', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const invitee = await createUser(app)
  const account = await createBankAccount(app, seller.row.id, { account_number: '1122334455' })
  // A direct-invite OFFER: `assigned_counterparty_id` carries no `kind`
  // restriction (only `requires_approval` is gig-only — see escrow-create),
  // so this is a reachable state and the two predicates genuinely differ on
  // it. Pre-accept is the ONLY window where they do: an accept installs the
  // invitee as `counterparty_id`, which makes them settled.
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    assigned_counterparty_id: invitee.row.id,
  })
  await attachExchangeDetails(app, escrow.id, {
    payout_account_id: account.id,
    payment_proof_url: 'https://res.cloudinary.com/test-cloud/image/upload/invited.jpg',
  })

  const body = (await offerDetail(app, escrow.id, invitee.token)).json()
  // The WIDER gate (isEscrowPartyOrAssignedRow) admits them to the trade…
  assert.ok(body.payment_proof_url !== null)
  // …and the NARROWER one (isEscrowPartyRow) still refuses the seller's
  // account number. They have not accepted, so there is nothing for them to
  // pay into yet — and until they do, an invite is not consent to hand over
  // someone's bank details. Collapsing the two predicates into one is the
  // mutation this test exists to fail on.
  assert.strictEqual(body.payout_account, null)

  // The seller, who IS settled, sees their own account on the same offer —
  // so the null above is the gate, not an unlinked account.
  const sellerView = (await offerDetail(app, escrow.id, seller.token)).json()
  assert.strictEqual(sellerView.payout_account.account_number, '1122334455')
})

test('exchange detail: the assignee id is withheld but `is_assigned` still tells the truth', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const invitee = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    assigned_counterparty_id: invitee.row.id,
  })
  await attachExchangeDetails(app, escrow.id)

  // The exact pairing the gig detail publishes, now on the offer wire. Before
  // it, an outsider could not tell an invite-only offer from an open one, so
  // the CTA showed them an Accept the transition endpoint answers with 403.
  const outsider = (await offerDetail(app, escrow.id, stranger.token)).json()
  assert.strictEqual(outsider.assigned_counterparty_id, null)
  assert.strictEqual(outsider.is_assigned, true)

  // The invitee IS a party, so they get the id — which is what lets `canAccept`
  // match them against it and keep the button they alone are entitled to.
  const invited = (await offerDetail(app, escrow.id, invitee.token)).json()
  assert.strictEqual(invited.assigned_counterparty_id, invitee.row.id)
  assert.strictEqual(invited.is_assigned, true)
})

test('exchange detail: an ordinary offer reports the unrestricted mode to everyone', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: seller.row.id, kind: 'exchange', status: 'open' })
  await attachExchangeDetails(app, escrow.id)

  for (const token of [seller.token, stranger.token]) {
    const body = (await offerDetail(app, escrow.id, token)).json()
    assert.strictEqual(body.is_assigned, false)
    assert.strictEqual(body.assigned_counterparty_id, null)
    // Reported from the column, not hardcoded: exchange create rejects
    // `requires_approval` today, and this is the assertion that keeps the field
    // honest if that ever opens up.
    assert.strictEqual(body.requires_approval, false)
  }
})

test('exchange detail: an admin gets the terms, and neither evidence nor bank details', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedOffer(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })

  const body = (await offerDetail(app, escrow.id, mediator.token)).json()
  // Same rule as the gig side, so the two surfaces cannot drift: the trade is
  // the parties' business and the dossier is where mediation reads it.
  assertWithheld(body)
  assert.strictEqual(body.payment_proof_url, null)
  assert.strictEqual(body.payout_account, null)
})
