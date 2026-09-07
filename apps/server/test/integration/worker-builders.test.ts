import { beforeEach, test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { category_price_stats } from '@tenda/shared/db/schema/moderation'
import { buildProcessors, buildVerifyTxDeps } from '@server/workers/processors'
import type { JobName } from '@server/plugins/queue'
import { WORKER_CONCURRENCY } from '@server/plugins/workers'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import {
  TEST_DB_CONFIGURED,
  attachGigDetails,
  createEscrow,
  createUser,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
let capture: SideEffectCapture

beforeEach(() => {
  if (!skip) capture = installCapture(getApp())
})

test('buildVerifyTxDeps wires the live chains registry and republish function', { skip }, () => {
  const app = getApp()
  const dependencies = buildVerifyTxDeps(app)
  assert.strictEqual(dependencies.chains, app.chains)
  assert.strictEqual(typeof dependencies.republish, 'function')
  assert.ok(dependencies.store !== undefined && dependencies.eventStore !== undefined)
})

test('buildProcessors exposes exactly one handler for every job name', { skip }, () => {
  const processors = buildProcessors(getApp())
  const names = Object.keys(WORKER_CONCURRENCY) as JobName[]
  assert.ok(names.length > 0)
  for (const name of names) {
    assert.strictEqual(typeof processors[name], 'function', `${name} must be a function`)
  }
  assert.deepStrictEqual(Object.keys(processors).sort(), [...names].sort())
})

test('expire and reconcile processors are no-ops on an empty database', { skip }, async () => {
  const processors = buildProcessors(getApp())
  await processors['expire-escrows']({ tick_id: 'tick-1' })
  await processors.reconcile({})
  assert.strictEqual(capture.enqueued.length, 0)
})

test('update-price-stats rolls completed gigs into percentiles', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const category = `svc-${randomUUID().slice(0, 8)}`
  for (const amount_raw of ['100', '300', '200']) {
    const escrow = await createEscrow(app, {
      creator_id: creator.row.id,
      kind: 'gig',
      status: 'completed',
      amount_raw,
    })
    await attachGigDetails(app, escrow.id, { category, country: 'NG' })
  }
  await buildProcessors(app)['update-price-stats']({ tick_id: 'tick-ps' })
  const rows = await app.db
    .select()
    .from(category_price_stats)
    .where(eq(category_price_stats.category, category))
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].sample_size, 3)
  assert.strictEqual(rows[0].p10_amount_raw, '100')
  assert.strictEqual(rows[0].p50_amount_raw, '200')
  assert.strictEqual(rows[0].p90_amount_raw, '300')
})

test('update-price-stats ignores open gigs and exchange escrows', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const category = `svc-${randomUUID().slice(0, 8)}`
  const open = await createEscrow(app, {
    creator_id: creator.row.id,
    kind: 'gig',
    status: 'open',
    amount_raw: '999',
  })
  await attachGigDetails(app, open.id, { category, country: 'NG' })
  await createEscrow(app, {
    creator_id: creator.row.id,
    kind: 'exchange',
    status: 'completed',
    amount_raw: '5',
  })
  await buildProcessors(app)['update-price-stats']({ tick_id: 'tick-ps-neg' })
  const rows = await app.db
    .select()
    .from(category_price_stats)
    .where(eq(category_price_stats.category, category))
  assert.strictEqual(rows.length, 0)
})
