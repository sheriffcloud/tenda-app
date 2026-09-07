/**
 * #82 fraud flag — dispute-rate metric on admin user views:
 *   GET /v1/admin/users/:id        → { ...user, dispute_metric }
 *   GET /v1/admin/standing/:user_id → { standing, dispute_metric }
 *
 * FLAG only (never auto-restricts): rate strictly > 30% (3000 bps) of
 * closed two-party engagements AND at least 5 of them. Escrows that never
 * had a counterparty (cancelled drafts, nobody-accepted refunds) must not
 * dilute the denominator; live disputes sit on neither side.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { user_standing } from '@tenda/shared/db/schema/reputation'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
  type TestUser,
} from '../helpers/test-app'
import type { FastifyInstance } from 'fastify'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** Terminal two-party engagements for `subject`: n total, of which nResolved closed via dispute. */
async function closedEngagements(
  app: FastifyInstance,
  subject: TestUser,
  other: TestUser,
  n: number,
  nResolved: number,
): Promise<void> {
  for (let i = 0; i < n; i++) {
    // Mix sides: subject is creator on even rows, counterparty on odd —
    // the metric must count both.
    const asCreator = i % 2 === 0
    await createEscrow(app, {
      creator_id: asCreator ? subject.row.id : other.row.id,
      counterparty_id: asCreator ? other.row.id : subject.row.id,
      status: i < nResolved ? 'resolved' : 'completed',
    })
  }
}

async function fetchMetric(app: FastifyInstance, admin: TestUser, userId: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/users/${userId}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 200)
  return res.json().dispute_metric
}

test('flag raises: >30% disputed across ≥5 closed engagements (both sides counted)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const subject = await createUser(app)
  const other = await createUser(app)
  await closedEngagements(app, subject, other, 5, 2)

  const metric = await fetchMetric(app, admin, subject.row.id)
  assert.deepStrictEqual(metric, {
    closed_engagements: 5,
    disputed: 2,
    dispute_rate_bps: 4000,
    fraud_flag: true,
  })
})

test('no flag at exactly 30% (strict threshold) or below it', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const boundary = await createUser(app)
  const low = await createUser(app)
  const other = await createUser(app)
  await closedEngagements(app, boundary, other, 10, 3) // exactly 3000 bps
  await closedEngagements(app, low, other, 5, 1) // 2000 bps

  const atBoundary = await fetchMetric(app, admin, boundary.row.id)
  assert.strictEqual(atBoundary.dispute_rate_bps, 3000)
  assert.strictEqual(atBoundary.fraud_flag, false)

  const belowIt = await fetchMetric(app, admin, low.row.id)
  assert.strictEqual(belowIt.dispute_rate_bps, 2000)
  assert.strictEqual(belowIt.fraud_flag, false)
})

test('min-volume gate: high rate but <5 closed engagements never flags', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const subject = await createUser(app)
  const other = await createUser(app)
  await closedEngagements(app, subject, other, 3, 2) // 6667 bps but only 3 closed

  const metric = await fetchMetric(app, admin, subject.row.id)
  assert.strictEqual(metric.closed_engagements, 3)
  assert.strictEqual(metric.dispute_rate_bps, 6667)
  assert.strictEqual(metric.fraud_flag, false)
})

test('no dilution: counterparty-less terminals and live escrows stay out of the book', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const subject = await createUser(app)
  const other = await createUser(app)
  await closedEngagements(app, subject, other, 5, 2) // flagged book: 40%

  // Noise that must NOT alter the metric: cancelled/refunded with no
  // counterparty (junk drafts), a live open escrow, a live dispute.
  for (const status of ['cancelled', 'cancelled', 'refunded'] as const) {
    await createEscrow(app, { creator_id: subject.row.id, status })
  }
  await createEscrow(app, {
    creator_id: subject.row.id,
    counterparty_id: other.row.id,
    status: 'open',
  })
  await createEscrow(app, {
    creator_id: subject.row.id,
    counterparty_id: other.row.id,
    status: 'disputed',
  })

  const metric = await fetchMetric(app, admin, subject.row.id)
  assert.deepStrictEqual(metric, {
    closed_engagements: 5,
    disputed: 2,
    dispute_rate_bps: 4000,
    fraud_flag: true,
  })
})

test('zero engagements: null rate, no flag', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const fresh = await createUser(app)

  const metric = await fetchMetric(app, admin, fresh.row.id)
  assert.deepStrictEqual(metric, {
    closed_engagements: 0,
    disputed: 0,
    dispute_rate_bps: null,
    fraud_flag: false,
  })
})

test('standing endpoint carries the same metric', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const subject = await createUser(app)
  const other = await createUser(app)
  await closedEngagements(app, subject, other, 5, 3)
  await app.db.insert(user_standing).values({ user_id: subject.row.id })

  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/standing/${subject.row.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json().dispute_metric, {
    closed_engagements: 5,
    disputed: 3,
    dispute_rate_bps: 6000,
    fraud_flag: true,
  })
})
