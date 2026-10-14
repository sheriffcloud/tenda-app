/**
 * The whole `fee:set` flow against a real platform_config: the DB is written ONLY when
 * every chain confirms the target, and is untouched otherwise.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { platform_config } from '@tenda/shared/db/schema'
import { runFeeSet, writeConfiguredFees } from '@server/features/platform-fees/fee-set'
import { TEST_DB_CONFIGURED, resetDb, setPlatformConfig, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
const TARGET = { fee_bps: 300, seeker_fee_bps: 120 }
const chain = (chain_id: string, fee_bps: number, seeker_fee_bps: number) => ({ chain_id, getFees: async () => ({ fee_bps, seeker_fee_bps }) })
const row = async () => (await getApp().db.select().from(platform_config).where(eq(platform_config.id, 1)))[0]

async function seed() {
  await resetDb(getApp())
  await setPlatformConfig(getApp(), { fee_bps: 250, seeker_fee_bps: 100 })
}

test('every chain already at the target: the DB is written', { skip }, async () => {
  await seed()
  const { plan, wrote } = await runFeeSet({ db: getApp().db, adapters: [chain('a', 300, 120), chain('b', 300, 120)], target: TARGET })
  assert.strictEqual(plan.ready_to_write, true)
  assert.strictEqual(wrote, true)
  assert.deepStrictEqual({ fee: (await row()).fee_bps, seeker: (await row()).seeker_fee_bps }, { fee: 300, seeker: 120 })
})

test('one chain still on the old fees: the DB is UNTOUCHED, and the plan names the chains already changed', { skip }, async () => {
  await seed()
  const { plan, wrote } = await runFeeSet({ db: getApp().db, adapters: [chain('changed', 300, 120), chain('pending', 250, 100)], target: TARGET })
  assert.strictEqual(wrote, false)
  assert.deepStrictEqual(plan.chains.map((c) => `${c.chain_id}:${c.state}`), ['changed:at_target', 'pending:needs_change'])
  assert.deepStrictEqual({ fee: (await row()).fee_bps, seeker: (await row()).seeker_fee_bps }, { fee: 250, seeker: 100 })
})

test('an unreadable chain: the DB is untouched, because the target could not be confirmed there', { skip }, async () => {
  await seed()
  const dark = { chain_id: 'dark', getFees: async () => { throw new Error('rpc down') } }
  const { wrote } = await runFeeSet({ db: getApp().db, adapters: [chain('a', 300, 120), dark], target: TARGET })
  assert.strictEqual(wrote, false)
  assert.strictEqual((await row()).fee_bps, 250)
})

test('writing with no platform_config row is an error, not a silent no-op', { skip }, async () => {
  await resetDb(getApp())
  await assert.rejects(writeConfiguredFees(getApp().db, TARGET), /no row to update/)
})
