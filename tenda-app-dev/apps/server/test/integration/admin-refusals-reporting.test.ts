/**
 * Admin ESCROW-LIST and FINANCE refusals that no test executed (#105 T5d).
 *
 * Two read surfaces an operator uses to answer "what is happening" and "what
 * have we earned". finance.ts was 98 of 144 lines unexecuted — neither the fee
 * aggregation nor the transaction feed had ever run — so as with the
 * announcements tranche the refusals come WITH the controls their handlers
 * needed, not bolted onto code nothing had driven.
 *
 * THE FILTER GUARDS MATTER FOR ONE REASON. Each of these endpoints takes a
 * filter straight into a `where`, and each refuses a value outside its
 * vocabulary rather than matching nothing. The difference is what an operator
 * concludes: "no escrows are disputed" is a very different answer from "you
 * typo'd the status", and only the 400 can tell them apart.
 *
 * THE FEE AGGREGATION IS ASSERTED ON REAL ROWS, not just for a 200. Its loop
 * sums platform fees as BigInt strings — chosen because the totals outgrow
 * Number — and a loop that never ran over a non-empty result set proves nothing
 * about the summing.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { escrow_transactions } from '@tenda/shared/db/schema'
import { GIG_CATEGORIES } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createAdmin,
  authHeader,
} from '../helpers/test-app'
import { partiedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const ESCROWS = '/v1/admin/escrows'
const FEES = '/v1/admin/finance/fees'
const TXNS = '/v1/admin/finance/transactions'

/** One COMPLETED gig with a fee-bearing transaction, so the aggregation has rows. */
async function seedFeeRow(
  app: ReturnType<typeof getApp>,
  platform_fee_raw: string,
  type: 'approve' | 'resolve' = 'approve',
): Promise<{ escrow_id: string }> {
  const { escrow, creator } = await partiedEscrow(app, 'completed')
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type,
    tx_ref: `fee-${randomUUID()}`,
    amount_raw: '1000000',
    platform_fee_raw,
    actor_id: creator.row.id,
  })
  return { escrow_id: escrow.id }
}

// ---------- GET /v1/admin/escrows: the two filter vocabularies ---------------------

test('admin escrows: a status outside the enum is 400, not an empty page', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)

  for (const status of ['nonsense', 'expired', 'OPEN', 'open,accepted']) {
    const res = await app.inject({
      method: 'GET', url: `${ESCROWS}?status=${status}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 400, status)
    assert.match(res.json().message, /status must be one of/)
  }

  // 'expired' above is the interesting miss: it reads like a status this system
  // has, and deliberately does not — expiry is a refund path, not a state.
  const ok = await app.inject({
    method: 'GET', url: `${ESCROWS}?status=open`, headers: authHeader(a.token),
  })
  assert.strictEqual(ok.statusCode, 200, ok.body)
})

test('admin escrows: a category outside the vocabulary is 400', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)

  for (const category of ['nonsense', 'SERVICE', 'services']) {
    const res = await app.inject({
      method: 'GET', url: `${ESCROWS}?category=${category}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 400, category)
    assert.match(res.json().message, /category must be one of/)
  }

  // Every real category is accepted, so the 400 is the vocabulary rather than a
  // broken filter — and this loop is what fails if GIG_CATEGORIES gains a member
  // the route cannot serve.
  for (const category of GIG_CATEGORIES) {
    const ok = await app.inject({
      method: 'GET', url: `${ESCROWS}?category=${category}`, headers: authHeader(a.token),
    })
    assert.strictEqual(ok.statusCode, 200, `${category}: ${ok.body}`)
  }
})

// ---------- GET /v1/admin/finance/fees ---------------------------------------------

test('finance fees: an unparseable from or to is 400, naming which', { skip }, async () => {
  // Two guards, same status, different messages — and `new Date('nonsense')` is
  // an Invalid Date rather than a throw, so without these the range silently
  // becomes NaN and the report covers the wrong period.
  const app = getApp()
  const a = await createAdmin(app)

  for (const from of ['nonsense', '2026-13-45', 'yesterday']) {
    const res = await app.inject({
      method: 'GET', url: `${FEES}?from=${from}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 400, from)
    assert.match(res.json().message, /^from must be a valid ISO date$/)
  }

  for (const to of ['nonsense', '2026-13-45']) {
    const res = await app.inject({
      method: 'GET', url: `${FEES}?from=2026-01-01&to=${to}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 400, to)
    assert.match(res.json().message, /^to must be a valid ISO date$/)
  }
})

test('finance fees: sums platform fees per kind and overall (the control)', { skip }, async () => {
  // The aggregation had never run. It sums as BigInt strings because the totals
  // outgrow Number, so this asserts the ARITHMETIC over two rows rather than
  // just a 200 — one row could not tell a sum from a passthrough.
  const app = getApp()
  const a = await createAdmin(app)
  // DIFFERENT tx types on purpose. The query groups by (kind, type), so two
  // rows of the SAME type are summed by postgres and the JS accumulation below
  // never adds anything — MEASURED: with both as 'approve', mutants replacing
  // `total += fee` with `total = fee` SURVIVED. Two groups are what make the
  // per-kind and grand totals arithmetic rather than a passthrough.
  await seedFeeRow(app, '25000', 'approve')
  await seedFeeRow(app, '17000', 'resolve')

  const res = await app.inject({ method: 'GET', url: FEES, headers: authHeader(a.token) })
  assert.strictEqual(res.statusCode, 200, res.body)
  const body = res.json()

  // Both kinds are always present, even when one has no rows — the shape is a
  // contract the dashboard reads without checking.
  assert.ok(body.by_kind.gig, 'gig bucket present')
  assert.ok(body.by_kind.exchange, 'exchange bucket present')
  assert.strictEqual(body.by_kind.gig.total_fee_raw, '42000', 'the two gig groups are summed')
  assert.strictEqual(body.grand_total_fee_raw, '42000')
  assert.strictEqual(body.period.from, null)
  assert.strictEqual(body.period.to, null)
})

// ---------- GET /v1/admin/finance/transactions ---------------------------------------

test('finance transactions: a kind outside gig|exchange is 400', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)

  for (const kind of ['nonsense', 'GIG', 'gigs']) {
    const res = await app.inject({
      method: 'GET', url: `${TXNS}?kind=${kind}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 400, kind)
    assert.match(res.json().message, /kind must be "gig" or "exchange"/)
  }
})

test('finance transactions: the kind guard runs BEFORE the date range', { skip }, async () => {
  // Both answer 400. A request wrong in both ways must report the kind, because
  // that check sits above parseDateRange in the handler — and the two messages
  // are all a caller has to tell them apart.
  const app = getApp()
  const a = await createAdmin(app)

  const res = await app.inject({
    method: 'GET', url: `${TXNS}?kind=nonsense&from=nonsense`, headers: authHeader(a.token),
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /kind must be "gig" or "exchange"/)
})

test('finance transactions: lists rows with a total (the control)', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const { escrow_id } = await seedFeeRow(app, '9000')

  const res = await app.inject({ method: 'GET', url: `${TXNS}?kind=gig`, headers: authHeader(a.token) })
  assert.strictEqual(res.statusCode, 200, res.body)
  const body = res.json()
  assert.ok(body.total >= 1, 'the seeded transaction is counted')
  assert.ok(
    body.data.some((r: { escrow_id: string }) => r.escrow_id === escrow_id),
    'the seeded transaction is listed',
  )
  assert.strictEqual(body.limit, 20, 'the default page size is echoed')
  assert.strictEqual(body.offset, 0)
})
