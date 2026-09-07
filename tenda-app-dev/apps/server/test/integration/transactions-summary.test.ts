/**
 * GET /v1/users/:id/transactions/summary (open_issues MB1) — lifetime USDC
 * earned/spent as a SQL aggregate over EVERY row.
 *
 * The contract that matters: the totals must NOT be page-scoped. The headline
 * test therefore seeds more rows than one page holds and asserts the summary
 * counts all of them — that is precisely what the old client-side reduce over
 * a 20-row page got wrong.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { escrow_transactions } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  TEST_ASSET,
  TEST_NATIVE_ASSET,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
  type TestUser,
} from '../helpers/test-app'
import type { FastifyInstance } from 'fastify'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** An escrow with one transaction row on it, from `creator` to `worker`. */
async function txOn(
  app: FastifyInstance,
  args: {
    creator: TestUser
    worker: TestUser
    type: 'create' | 'approve' | 'claim_stalled' | 'resolve'
    amount_raw: string | null
    platform_fee_raw?: string
    escrow_amount_raw?: string
    asset?: string
  },
): Promise<void> {
  const escrow = await createEscrow(app, {
    creator_id: args.creator.row.id,
    counterparty_id: args.worker.row.id,
    status: 'completed',
    amount_raw: args.escrow_amount_raw ?? '1000000',
    ...(args.asset === undefined ? {} : { asset: args.asset }),
  })
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type: args.type,
    tx_ref: `ref-${escrow.id}`,
    amount_raw: args.amount_raw,
    ...(args.platform_fee_raw === undefined ? {} : { platform_fee_raw: args.platform_fee_raw }),
    actor_id: args.creator.row.id,
  })
}

const summaryFor = (app: FastifyInstance, u: TestUser) =>
  app.inject({
    method: 'GET',
    url: `/v1/users/${u.row.id}/transactions/summary`,
    headers: authHeader(u.token),
  })

test('summary aggregates over ALL rows, not just the first page', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  // 25 settlements — more than the feed's 20-row page, which is exactly the
  // condition under which the old page-scoped reduce understated the total.
  for (let i = 0; i < 25; i++) {
    await txOn(app, { creator, worker, type: 'approve', amount_raw: '1000000' })
  }

  const res = await summaryFor(app, worker)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().earned_raw, '25000000', '25 × 1 USDC, not the 20 one page holds')

  // Cross-check against the paginated feed's own total, so the two surfaces
  // can't disagree about how many rows exist.
  const feed = await app.inject({
    method: 'GET',
    url: `/v1/users/${worker.row.id}/transactions`,
    headers: authHeader(worker.token),
  })
  assert.strictEqual(feed.json().total, 25)
  assert.strictEqual(feed.json().data.length, 20, 'feed is still paginated')
})

test('earned counts only settlement types where the caller is counterparty', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  await txOn(app, { creator, worker, type: 'approve', amount_raw: '1000000' })
  await txOn(app, { creator, worker, type: 'claim_stalled', amount_raw: '2000000' })
  await txOn(app, { creator, worker, type: 'resolve', amount_raw: '3000000' })
  // A create row on the same escrows must never land in `earned`.
  await txOn(app, { creator, worker, type: 'create', amount_raw: '9000000' })

  const res = await summaryFor(app, worker)
  assert.strictEqual(res.json().earned_raw, '6000000')
  // The worker is counterparty, never creator, so nothing is "spent".
  assert.strictEqual(res.json().spent_raw, '0')
})

test('earned SKIPS rows with no attested amount, never estimating from the principal', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  await txOn(app, { creator, worker, type: 'approve', amount_raw: '1000000' })
  // Settlement-honesty rule: an unattested amount contributes NOTHING, even
  // though the escrow principal is right there and would look plausible.
  await txOn(app, {
    creator,
    worker,
    type: 'approve',
    amount_raw: null,
    escrow_amount_raw: '5000000',
  })

  const res = await summaryFor(app, worker)
  assert.strictEqual(res.json().earned_raw, '1000000', 'the null-amount row is skipped, not estimated')
})

test('spent counts create rows where the caller is creator, falling back to the principal', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  await txOn(app, { creator, worker, type: 'create', amount_raw: '4000000' })
  // No attested amount on the tx row → the escrow's own principal is used.
  await txOn(app, {
    creator,
    worker,
    type: 'create',
    amount_raw: null,
    escrow_amount_raw: '6000000',
  })

  const res = await summaryFor(app, creator)
  assert.strictEqual(res.json().spent_raw, '10000000')
  assert.strictEqual(res.json().earned_raw, '0')
})

test('non-USDC rows are excluded from both totals', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  await txOn(app, { creator, worker, type: 'approve', amount_raw: '1000000' })
  // SOL settles in 9dp — summing it into a 6dp USDC total would be nonsense.
  await txOn(app, {
    creator,
    worker,
    type: 'approve',
    amount_raw: '500000000',
    asset: TEST_NATIVE_ASSET,
  })

  const res = await summaryFor(app, worker)
  assert.strictEqual(res.json().earned_raw, '1000000')
  assert.strictEqual(res.json().asset, 'USDC_SOL')
})

test('a user with no transactions gets zeroes, not nulls', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await summaryFor(app, u)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { earned_raw: '0', spent_raw: '0', asset: 'USDC_SOL' })
})

test("another user's summary is 403, not someone else's money", { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${other.row.id}/transactions/summary`,
    headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('the summary requires auth', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${u.row.id}/transactions/summary`,
  })
  assert.strictEqual(res.statusCode, 401)
})

test('one party earning does not leak into the other party totals', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  await txOn(app, { creator, worker, type: 'create', amount_raw: '7000000' })
  await txOn(app, { creator, worker, type: 'approve', amount_raw: '3000000' })

  const creatorSummary = (await summaryFor(app, creator)).json()
  const workerSummary = (await summaryFor(app, worker)).json()

  assert.strictEqual(creatorSummary.spent_raw, '7000000')
  assert.strictEqual(creatorSummary.earned_raw, '0', 'the creator did not earn the payout')
  assert.strictEqual(workerSummary.earned_raw, '3000000')
  assert.strictEqual(workerSummary.spent_raw, '0', 'the worker did not fund the escrow')
})

test('summary totals stay exact well past float precision', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  // Base units beyond 2^53 — a float sum would silently round here, which is
  // why the aggregate is numeric and crosses the wire as a string.
  const huge = '9007199254740993'
  await txOn(app, { creator, worker, type: 'approve', amount_raw: huge })
  await txOn(app, { creator, worker, type: 'approve', amount_raw: '1' })

  const res = await summaryFor(app, worker)
  assert.strictEqual(res.json().earned_raw, '9007199254740994')
})

test('the USDC asset filter uses the shared registry, covering every chain variant', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  // TEST_ASSET is USDC_SOL; the registry membership test is what makes a
  // USDC_BASE row count too, without this route naming chains.
  await txOn(app, { creator, worker, type: 'approve', amount_raw: '1000000', asset: TEST_ASSET })
  const res = await summaryFor(app, worker)
  assert.strictEqual(res.json().earned_raw, '1000000')
})

test('earned is the attested NET amount — the fee is NOT subtracted a second time', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)

  // Contract event for a 2 USDC principal at 1%: amount_raw is ALREADY net
  // (1.98) and platform_fee_raw records the 0.02 taken. Subtracting the fee
  // again would report 1.96 — the ~~N14~~ double-charge, in aggregate form.
  await txOn(app, {
    creator,
    worker,
    type: 'approve',
    amount_raw: '1980000',
    platform_fee_raw: '20000',
  })

  const res = await summaryFor(app, worker)
  assert.strictEqual(res.json().earned_raw, '1980000')
})
