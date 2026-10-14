/**
 * GET /v1/users/me/overview — the dashboard's counts in one round trip (#17).
 *
 * The property that matters is AGREEMENT: each figure must equal the `total`
 * of the list call it replaces. The expected numbers are hand-counted from a
 * fixture that includes every row the predicates must exclude (drafts, other
 * people's gigs, resolved disputes), and each is then checked against the list
 * endpoint so the two cannot drift apart silently.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { disputes, reviews } from '@tenda/shared/db/schema'
import type { MyOverviewResponse } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  authHeader,
  type TestUser,
} from '../helpers/test-app'
import type { EscrowStatus } from '../helpers/fixtures'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type App = ReturnType<typeof getApp>

async function gig(app: App, creator: TestUser, status: EscrowStatus, worker?: TestUser): Promise<string> {
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker?.row.id ?? null,
    status,
  })
  await attachGigDetails(app, escrow.id, { title: `gig ${status}` })
  return escrow.id
}

async function overview(app: App, user: TestUser): Promise<MyOverviewResponse> {
  const res = await app.inject({ method: 'GET', url: '/v1/users/me/overview', headers: authHeader(user.token) })
  assert.strictEqual(res.statusCode, 200)
  return res.json()
}

async function total(app: App, user: TestUser, url: string): Promise<number> {
  const res = await app.inject({ method: 'GET', url, headers: authHeader(user.token) })
  assert.strictEqual(res.statusCode, 200)
  return res.json().total
}

test('overview: requires authentication', { skip }, async () => {
  const res = await getApp().inject({ method: 'GET', url: '/v1/users/me/overview' })
  assert.strictEqual(res.statusCode, 401)
})

test('overview: a brand-new user reads all zeros', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  assert.deepStrictEqual(await overview(app, user), {
    stats: { posted: 0, active: 0, completed: 0, reviews: 0 },
    open_disputes: 0,
  })
})

test('overview: counts match the list totals they replace', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  const stranger = await createUser(app)

  // Posted by me: draft is NOT posted; the other six are. Active = open,
  // accepted, submitted.
  await gig(app, me, 'draft')
  await gig(app, me, 'open')
  await gig(app, me, 'accepted', other)
  await gig(app, me, 'submitted', other)
  const completedByOther = await gig(app, me, 'completed', other)
  const completedByOther2 = await gig(app, me, 'completed', other)
  await gig(app, me, 'cancelled')
  const disputedAsCreator = await gig(app, me, 'disputed', other)
  const resolved = await gig(app, me, 'resolved', other)
  // Resolved on the dispute row but the escrow row not yet moved on: the
  // `resolved_at IS NULL` half of the live-dispute guard is what excludes it.
  const resolvedRowStillDisputed = await gig(app, me, 'disputed', other)

  // Worked by me: one completed (counts), one still accepted (does not).
  await gig(app, other, 'completed', me)
  const disputedAsWorker = await gig(app, other, 'disputed', me)
  await gig(app, other, 'accepted', me)

  // A stranger's gigs touch nothing of mine.
  await gig(app, stranger, 'open')
  await gig(app, stranger, 'completed', other)

  // Disputes: two open (one per side), one resolved, one stranger's.
  await app.db.insert(disputes).values([
    { escrow_id: disputedAsCreator, raised_by: me.row.id, reason: 'no show' },
    { escrow_id: disputedAsWorker, raised_by: other.row.id, reason: 'unpaid' },
    { escrow_id: resolved, raised_by: me.row.id, reason: 'old', resolved_at: new Date() },
    { escrow_id: resolvedRowStillDisputed, raised_by: me.row.id, reason: 'race', resolved_at: new Date() },
  ])

  // Reviews ABOUT me count; reviews I wrote do not.
  await app.db.insert(reviews).values([
    { escrow_id: completedByOther, reviewer_id: other.row.id, reviewee_id: me.row.id, score: 5, comment: 'ok' },
    { escrow_id: disputedAsWorker, reviewer_id: me.row.id, reviewee_id: other.row.id, score: 4, comment: 'ok' },
    { escrow_id: completedByOther2, reviewer_id: me.row.id, reviewee_id: other.row.id, score: 3, comment: 'ok' },
  ])

  const got = await overview(app, me)
  assert.deepStrictEqual(got, {
    stats: { posted: 9, active: 3, completed: 1, reviews: 1 },
    open_disputes: 2,
  })

  // Agreement with the lists the dashboard used to read.
  assert.strictEqual(got.stats.posted, await total(app, me,
    '/v1/gigs?mine=created&limit=1&status=open,accepted,submitted,completed,cancelled,refunded,disputed,resolved'))
  assert.strictEqual(got.stats.active, await total(app, me, '/v1/gigs?mine=created&status=open,accepted,submitted&limit=1'))
  assert.strictEqual(got.stats.completed, await total(app, me, '/v1/gigs?mine=working&status=completed&limit=1'))
  assert.strictEqual(got.open_disputes, await total(app, me, '/v1/disputes?status=open&limit=1'))
  const reviewsRes = await app.inject({ method: 'GET', url: `/v1/users/${me.row.id}/reviews?limit=1` })
  assert.strictEqual(got.stats.reviews, reviewsRes.json().total)
})

test('overview: an abandoned dispute row on a non-disputed escrow is not open', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const escrow = await gig(app, me, 'accepted')
  await app.db.insert(disputes).values({ escrow_id: escrow, raised_by: me.row.id, reason: 'unconfirmed' })
  assert.strictEqual((await overview(app, me)).open_disputes, 0)
})
