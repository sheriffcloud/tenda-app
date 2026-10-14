/**
 * The #58 data repair, against a real table.
 *
 * WHY THIS FILE EXISTS AT ALL. `db:backfill-gas-grant-status` rewrites every
 * historical `gas_grants` row exactly once, on a production database, during an
 * upgrade — and it translates state that used to live inside a STRING into a
 * real column. Get the mapping backwards and every user is mislabelled: one who
 * was paid reads as never-signed (a permanent spinner, and a healthy grant
 * listed as unfinished by the audit), or worse, one who was never paid reads as
 * `delivered` and can never claim again.
 *
 * The mapping was originally welded inside `main()` with its own postgres
 * connection, which made it unreachable from any suite — so the only way to find
 * out whether it worked was to run it on real data. That is what these tests
 * replace.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { gas_grants } from '@tenda/shared/db/schema/gas-seed'
import { applyBackfill, countBackfillTargets } from '@server/scripts/backfill-gas-grant-status'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'
// The SAME chain fixture the claim suites use, not a third copy of "a seedable
// chain" — the grant rows below carry a foreign key to it.
import { AMOUNT, CHAIN, withSeedableChain } from '../helpers/gas-seed-claim-db'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const REAL_TX = `0x${'ab'.repeat(32)}`

/**
 * A row in the PRE-migration shape: the status column exists (the migration has
 * run) and defaults to `claimed`, while the tx_ref still carries whatever the
 * old code wrote there. That is exactly the state an upgraded database is in
 * before the backfill.
 */
async function legacyGrant(
  app: ReturnType<typeof getApp>,
  tx_ref: string,
): Promise<string> {
  const user = await createUser(app)
  await app.db.insert(gas_grants).values({
    user_id: user.row.id,
    chain_id: CHAIN,
    amount_raw: AMOUNT,
    tx_ref,
  })
  return user.row.id
}

async function statusOf(app: ReturnType<typeof getApp>, user_id: string) {
  const [row] = await app.db.select().from(gas_grants).where(eq(gas_grants.user_id, user_id))
  return row
}

test('a PLACEHOLDER row becomes `claimed` with no reference', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const user = await legacyGrant(app, `pending:someone:${CHAIN}`)

  const counts = await applyBackfill(app.db)

  const row = await statusOf(app, user)
  assert.strictEqual(row?.status, 'claimed')
  assert.strictEqual(row?.tx_ref, null, 'the placeholder was never a transaction')
  assert.ok(counts.cleared >= 1)
})

test('a STAMPED row becomes `delivered`, keeping its reference', { skip }, async () => {
  // The old code only ever wrote a real ref after a transfer had confirmed, so
  // this is the one mapping that may promote a row to a terminal success.
  const app = getApp()
  await withSeedableChain(app)
  const user = await legacyGrant(app, REAL_TX)

  await applyBackfill(app.db)

  const row = await statusOf(app, user)
  assert.strictEqual(row?.status, 'delivered')
  assert.strictEqual(row?.tx_ref, REAL_TX, 'the reference is the audit trail; it must survive')
})

test('a placeholder is NEVER promoted to delivered — the exclusion is load-bearing', { skip }, async () => {
  // The failure that would be worst and quietest: a `pending:` row matching
  // "has a reference, still claimed" and being stamped `delivered` — marking a
  // user paid for a transfer that never existed, permanently, because of the
  // primary key.
  //
  // What prevents it is the `not(like(tx_ref, 'pending:%'))` clause on the
  // promote predicate, NOT the order of the two updates. This test was first
  // written as an order test and proved decorative — swapping the updates
  // reddened nothing, because the clause already excludes them.
  const app = getApp()
  await withSeedableChain(app)
  const placeholder = await legacyGrant(app, `pending:a:${CHAIN}`)
  const stamped = await legacyGrant(app, REAL_TX)

  await applyBackfill(app.db)

  assert.strictEqual((await statusOf(app, placeholder))?.status, 'claimed')
  assert.strictEqual((await statusOf(app, stamped))?.status, 'delivered')
})

test('running it TWICE changes nothing the second time', { skip }, async () => {
  // An operator who is unsure whether it ran must be able to just run it. The
  // second pass matching anything would mean the predicates match their own
  // output, which is how a re-run corrupts what the first one fixed.
  const app = getApp()
  await withSeedableChain(app)
  const placeholder = await legacyGrant(app, `pending:b:${CHAIN}`)
  const stamped = await legacyGrant(app, REAL_TX)

  const first = await applyBackfill(app.db)
  assert.ok(first.cleared >= 1 && first.delivered >= 1, 'the first run did the work')

  const second = await applyBackfill(app.db)
  assert.deepStrictEqual(second, { cleared: 0, delivered: 0 }, 'a second run is a no-op')
  assert.strictEqual((await statusOf(app, placeholder))?.status, 'claimed')
  assert.strictEqual((await statusOf(app, stamped))?.status, 'delivered')
})

test('--dry-run counts exactly what a real run would touch, and writes nothing', { skip }, async () => {
  const app = getApp()
  await withSeedableChain(app)
  const placeholder = await legacyGrant(app, `pending:c:${CHAIN}`)
  await legacyGrant(app, REAL_TX)

  const would = await countBackfillTargets(app.db)
  assert.ok(would.cleared >= 1 && would.delivered >= 1)
  // Nothing moved.
  assert.strictEqual((await statusOf(app, placeholder))?.status, 'claimed')
  assert.strictEqual((await statusOf(app, placeholder))?.tx_ref, `pending:c:${CHAIN}`)

  const did = await applyBackfill(app.db)
  assert.deepStrictEqual(did, would, 'the dry run must predict the real run exactly')
})

test('a row already in a POST-backfill state is left alone', { skip }, async () => {
  // Grants written after the upgrade are already correct. The predicates must
  // not touch them — a `submitted` grant demoted to `claimed` would lose the
  // reference to money that is in flight.
  const app = getApp()
  await withSeedableChain(app)
  const user = await createUser(app)
  const at = new Date()
  await app.db.insert(gas_grants).values({
    user_id: user.row.id,
    chain_id: CHAIN,
    amount_raw: AMOUNT,
    status: 'submitted',
    tx_ref: `0x${'cd'.repeat(32)}`,
    submitted_at: at,
  })

  await applyBackfill(app.db)

  const row = await statusOf(app, user.row.id)
  assert.strictEqual(row?.status, 'submitted', 'an in-flight transfer must not be rewritten')
  assert.strictEqual(row?.tx_ref, `0x${'cd'.repeat(32)}`)
})
