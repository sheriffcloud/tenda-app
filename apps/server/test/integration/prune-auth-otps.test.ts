/**
 * prune-auth-otps — what the prune may delete, against the real table.
 *
 * The invariant that makes this more than a DELETE: `sendOtp` counts rows by
 * `created_at` whether they were consumed or have expired, so a spent code is
 * still load-bearing for the rate limit until it is older than the longest
 * window. A prune that cleaned "consumed or expired" rows would quietly loosen
 * the limit. These pin the age rule, and then pin the consequence.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { auth_otps } from '@tenda/shared/db/schema'
import {
  OTP_IDENTIFIER_WINDOW_MS,
  OTP_MAX_SENDS_PER_IDENTIFIER_PER_HOUR,
  OTP_MAX_SENDS_PER_USER_PER_DAY,
  OTP_RETENTION_MS,
  OTP_USER_WINDOW_MS,
  drizzleOtpStore,
  sendOtp,
} from '@server/features/auth/otp'
import { handlePruneAuthOtps } from '@server/queue/jobs/prune-auth-otps'
import { buildProcessors } from '@server/queue/workers/processors'
import { TEST_DB_CONFIGURED, createUser, resetDb, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const NOW = new Date('2026-10-10T12:00:00Z')
const ago = (ms: number): Date => new Date(NOW.getTime() - ms)
const HOUR = 3_600_000
const noLog = { info: () => undefined }

interface RowState {
  created_at: Date
  consumed?: boolean
  expired?: boolean
  identifier?: string
  user_id?: string | null
}

async function insertCode(state: RowState): Promise<string> {
  const id = randomUUID()
  await getApp().db.insert(auth_otps).values({
    id,
    channel: 'phone',
    identifier: state.identifier ?? '+2348012345678',
    user_id: state.user_id ?? null,
    code_hash: 'salt:hash',
    expires_at: state.expired === true ? new Date(state.created_at.getTime() - 1) : new Date(state.created_at.getTime() + 600_000),
    consumed_at: state.consumed === true ? state.created_at : null,
    created_at: state.created_at,
  })
  return id
}

async function surviving(ids: string[]): Promise<string[]> {
  const rows = await getApp().db.select({ id: auth_otps.id }).from(auth_otps).where(inArray(auth_otps.id, ids))
  return rows.map((r) => r.id).sort()
}

const prune = () => handlePruneAuthOtps({ db: getApp().db, now: () => NOW, log: noLog })

test('the retention is the LONGEST send window, derived from the windows themselves', () => {
  assert.strictEqual(OTP_RETENTION_MS, Math.max(OTP_IDENTIFIER_WINDOW_MS, OTP_USER_WINDOW_MS))
  assert.strictEqual(OTP_RETENTION_MS, OTP_USER_WINDOW_MS, 'the per-user DAY window is the longest today')
})

test('codes older than the longest window go, in every state', { skip }, async () => {
  await resetDb(getApp())
  const old = ago(OTP_RETENTION_MS + HOUR)
  const ids = [
    await insertCode({ created_at: old }),
    await insertCode({ created_at: old, consumed: true }),
    await insertCode({ created_at: old, expired: true }),
  ]
  assert.deepStrictEqual(await prune(), { pruned: 3, pruned_admin: 0 })
  assert.deepStrictEqual(await surviving(ids), [])
})

test('codes still inside the window stay — consumed and expired ones INCLUDED, because the limiter counts them', { skip }, async () => {
  await resetDb(getApp())
  const young = ago(OTP_RETENTION_MS - HOUR)
  const ids = [
    await insertCode({ created_at: young }),
    await insertCode({ created_at: young, consumed: true }),
    await insertCode({ created_at: young, expired: true }),
  ]
  assert.deepStrictEqual(await prune(), { pruned: 0, pruned_admin: 0 })
  assert.deepStrictEqual(await surviving(ids), ids.slice().sort())
})

test('the cutoff is strict: a code created exactly one window ago is kept, one millisecond older goes', { skip }, async () => {
  await resetDb(getApp())
  const exact = await insertCode({ created_at: ago(OTP_RETENTION_MS) })
  const older = await insertCode({ created_at: ago(OTP_RETENTION_MS + 1) })
  assert.deepStrictEqual(await prune(), { pruned: 1, pruned_admin: 0 })
  assert.deepStrictEqual(await surviving([exact, older]), [exact])
})

test('a prune does not loosen the per-identifier limit: spent codes inside the hour still block the next send', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const store = drizzleOtpStore(app.db)
  const identifier = '+2348099990000'
  for (let i = 0; i < OTP_MAX_SENDS_PER_IDENTIFIER_PER_HOUR; i += 1) {
    await insertCode({ created_at: ago(10 * 60_000), consumed: true, expired: true, identifier })
  }
  await prune()
  const send = () => sendOtp({ store, dispatch: async () => undefined, now: () => NOW }, { channel: 'phone', identifier, user_id: null })
  await assert.rejects(send(), (e: unknown) => e instanceof Error && 'code' in e && e.code === ErrorCode.OTP_RATE_LIMITED)
})

test('a prune does not loosen the per-user DAY limit: codes 23 hours old, long spent, still count', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const user = await createUser(app)
  const store = drizzleOtpStore(app.db)
  for (let i = 0; i < OTP_MAX_SENDS_PER_USER_PER_DAY; i += 1) {
    await insertCode({ created_at: ago(23 * HOUR), consumed: true, identifier: `+23480000000${i}`, user_id: user.row.id })
  }
  await prune()
  const send = () =>
    sendOtp({ store, dispatch: async () => undefined, now: () => NOW }, { channel: 'phone', identifier: '+2348077770000', user_id: user.row.id })
  await assert.rejects(send(), (e: unknown) => e instanceof Error && 'code' in e && e.code === ErrorCode.OTP_RATE_LIMITED)
})

test('nothing to prune: nothing happens, and an empty table is not an error', { skip }, async () => {
  await resetDb(getApp())
  assert.deepStrictEqual(await prune(), { pruned: 0, pruned_admin: 0 })
})

test('the processor binding prunes the real table against the real clock', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const stale = await insertCode({ created_at: new Date(Date.now() - OTP_RETENTION_MS - HOUR) })
  const fresh = await insertCode({ created_at: new Date(Date.now() - HOUR) })
  assert.deepStrictEqual(await buildProcessors(app)['prune-auth-otps']({ tick_id: 'test' }), { pruned: 1, pruned_admin: 0 })
  assert.deepStrictEqual(await surviving([stale, fresh]), [fresh])
})
