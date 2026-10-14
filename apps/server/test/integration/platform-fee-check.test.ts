/**
 * The boot-time fee check against a real platform_config row: silent when every chain
 * agrees, ONE error when a contract disagrees, no error for a chain it cannot read, and
 * it never writes and never throws.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { platform_config } from '@tenda/shared/db/schema'
import { checkPlatformFees, configuredFees } from '@server/features/platform-fees/boot-check'
import { TEST_DB_CONFIGURED, resetDb, setPlatformConfig, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type Line = { level: 'error' | 'warn' | 'info'; payload: unknown; message: string }
function logger() {
  const lines: Line[] = []
  const at = (level: Line['level']) => (payload: unknown, message?: string) => { lines.push({ level, payload, message: message ?? '' }) }
  return { lines, log: { error: at('error'), warn: at('warn'), info: at('info') } }
}
const chain = (chain_id: string, fee_bps: number, seeker_fee_bps: number) => ({ chain_id, getFees: async () => ({ fee_bps, seeker_fee_bps }) })

test('configuredFees reads the row fresh: a change is seen at once, not after the 5-minute cache', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  await setPlatformConfig(app, { fee_bps: 300, seeker_fee_bps: 120 })
  assert.deepStrictEqual(await configuredFees(app.db), { fee_bps: 300, seeker_fee_bps: 120 })
})

test('every chain agrees: one info line, no error, no warning', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { fee_bps, seeker_fee_bps } = await configuredFees(app.db)
  const { lines, log } = logger()
  await checkPlatformFees({ db: app.db, adapters: [chain('a', fee_bps, seeker_fee_bps), chain('b', fee_bps, seeker_fee_bps)], log })
  assert.deepStrictEqual(lines.map((l) => l.level), ['info'])
})

test('a contract that disagrees raises exactly ONE error naming the chain, and the fix', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { fee_bps, seeker_fee_bps } = await configuredFees(app.db)
  const { lines, log } = logger()
  const result = await checkPlatformFees({ db: app.db, adapters: [chain('ok', fee_bps, seeker_fee_bps), chain('drifted', fee_bps + 50, seeker_fee_bps)], log })
  assert.deepStrictEqual(lines.map((l) => l.level), ['error'])
  assert.match(lines[0].message, /platform fee mismatch on 1 chain/)
  assert.match(lines[0].message, /fee:check/)
  assert.match(JSON.stringify(lines[0].payload), /drifted/)
  assert.strictEqual(result?.mismatched.length, 1)
})

test('a chain it cannot read is a WARNING, never an error: unknown is not a mismatch', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { fee_bps, seeker_fee_bps } = await configuredFees(app.db)
  const { lines, log } = logger()
  await checkPlatformFees({ db: app.db, adapters: [chain('ok', fee_bps, seeker_fee_bps), { chain_id: 'dark', getFees: async () => { throw new Error('rpc down') } }], log })
  assert.deepStrictEqual(lines.map((l) => l.level), ['warn'])
})

test('a mismatch and an unreadable chain together still raise the one error', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { fee_bps, seeker_fee_bps } = await configuredFees(app.db)
  const { lines, log } = logger()
  await checkPlatformFees({ db: app.db, adapters: [chain('drifted', fee_bps + 1, seeker_fee_bps), { chain_id: 'dark', getFees: async () => { throw new Error('x') } }], log })
  assert.deepStrictEqual(lines.map((l) => l.level), ['error'])
})

test('it NEVER writes: platform_config is untouched by a mismatch', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  // resetDb leaves platform_config EMPTY, and an UPDATE of no rows proves nothing: seed the row first.
  await setPlatformConfig(app, { fee_bps: 250, seeker_fee_bps: 100 })
  const before = await app.db.select().from(platform_config).where(eq(platform_config.id, 1))
  assert.strictEqual(before.length, 1, 'the precondition: a row exists for a write to change')
  const { log } = logger()
  await checkPlatformFees({ db: app.db, adapters: [chain('drifted', 300, 120)], log })
  assert.deepStrictEqual(await app.db.select().from(platform_config).where(eq(platform_config.id, 1)), before)
})

test('it never throws and never blocks: an adapter that throws synchronously, and no adapters at all, both just return', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const { lines, log } = logger()
  await checkPlatformFees({ db: app.db, adapters: [{ chain_id: 's', getFees: (): Promise<never> => { throw new Error('sync') } }], log })
  assert.deepStrictEqual(lines.map((l) => l.level), ['warn'])
  const empty = logger()
  const result = await checkPlatformFees({ db: app.db, adapters: [], log: empty.log })
  assert.deepStrictEqual(empty.lines.map((l) => l.level), ['info'])
  assert.deepStrictEqual(result?.agreeing, [])
})

test('the check is advisory even when the DATABASE is down: it warns and returns null rather than throwing', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const broken: typeof app.db = Object.assign(Object.create(app.db), { select: () => { throw new Error('db down') } })
  const { lines, log } = logger()
  const result = await checkPlatformFees({ db: broken, adapters: [chain('a', 250, 100)], log })
  assert.strictEqual(result, null)
  assert.deepStrictEqual(lines.map((l) => l.level), ['warn'])
  assert.match(lines[0].message, /could not run/)
})
