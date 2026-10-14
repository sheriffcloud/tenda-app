/**
 * prune-auth-otps, admin half — `email_otps` against the real table.
 *
 * Same invariant as the phone/email codes: `sendAdminLoginOtp` counts rows by
 * `created_at` whether they were consumed or have expired, so a spent admin code
 * is load-bearing for the rate limit until it is older than the longest window.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { email_otps } from '@tenda/shared/db/schema/identity'
import {
  ADMIN_OTP_EMAIL_WINDOW_MS,
  ADMIN_OTP_MAX_SENDS_PER_EMAIL_PER_HOUR,
  ADMIN_OTP_RETENTION_MS,
  ADMIN_OTP_USER_WINDOW_MS,
  sendAdminLoginOtp,
} from '@server/features/auth/admin/admin-otp'
import { grantAdminEmail } from '@server/features/auth/admin/admin-auth'
import { handlePruneAuthOtps } from '@server/queue/jobs/prune-auth-otps'
import { buildProcessors } from '@server/queue/workers/processors'
import { TEST_DB_CONFIGURED, createUser, resetDb, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const NOW = new Date('2026-10-10T12:00:00Z')
const ago = (ms: number): Date => new Date(NOW.getTime() - ms)
const HOUR = 3_600_000
const noLog = { info: () => undefined }
const EMAIL = 'ops@tenda.app'

async function makeAdmin(app: FastifyInstance): Promise<string> {
  const admin = await createUser(app, { role: 'super_admin' })
  await grantAdminEmail(app.db, { user_id: admin.row.id, email: EMAIL, added_by: null })
  return admin.row.id
}

async function insertCode(user_id: string, created_at: Date, consumed = false): Promise<string> {
  const id = randomUUID()
  await getApp().db.insert(email_otps).values({
    id,
    email: EMAIL,
    user_id,
    code_hash: 'salt:hash',
    expires_at: new Date(created_at.getTime() + 600_000),
    consumed_at: consumed ? created_at : null,
    created_at,
  })
  return id
}

async function surviving(ids: string[]): Promise<string[]> {
  const rows = await getApp().db.select({ id: email_otps.id }).from(email_otps).where(inArray(email_otps.id, ids))
  return rows.map((r) => r.id).sort()
}

const prune = () => handlePruneAuthOtps({ db: getApp().db, now: () => NOW, log: noLog })

test('the admin retention is the LONGEST admin send window', () => {
  assert.strictEqual(ADMIN_OTP_RETENTION_MS, Math.max(ADMIN_OTP_EMAIL_WINDOW_MS, ADMIN_OTP_USER_WINDOW_MS))
  assert.strictEqual(ADMIN_OTP_RETENTION_MS, ADMIN_OTP_USER_WINDOW_MS, 'the per-user DAY window is the longest today')
})

test('admin codes older than the window go (consumed or not); younger ones stay', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const user = await makeAdmin(app)
  const old = [await insertCode(user, ago(ADMIN_OTP_RETENTION_MS + HOUR)), await insertCode(user, ago(ADMIN_OTP_RETENTION_MS + HOUR), true)]
  const young = [await insertCode(user, ago(ADMIN_OTP_RETENTION_MS - HOUR)), await insertCode(user, ago(ADMIN_OTP_RETENTION_MS - HOUR), true)]
  assert.deepStrictEqual(await prune(), { pruned: 0, pruned_admin: 2 })
  assert.deepStrictEqual(await surviving(old), [])
  assert.deepStrictEqual(await surviving(young), young.slice().sort())
})

test('the cutoff is strict: exactly one window old is kept, one millisecond older goes', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const user = await makeAdmin(app)
  const exact = await insertCode(user, ago(ADMIN_OTP_RETENTION_MS))
  const older = await insertCode(user, ago(ADMIN_OTP_RETENTION_MS + 1))
  assert.deepStrictEqual(await prune(), { pruned: 0, pruned_admin: 1 })
  assert.deepStrictEqual(await surviving([exact, older]), [exact])
})

test('a prune does not loosen the per-email limit: spent admin codes inside the hour still block the next send', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const user = await makeAdmin(app)
  for (let i = 0; i < ADMIN_OTP_MAX_SENDS_PER_EMAIL_PER_HOUR; i += 1) await insertCode(user, ago(10 * 60_000), true)
  await prune()
  let sent = 0
  await sendAdminLoginOtp({ db: app.db, sender: { send: async () => { sent += 1 } }, now: () => NOW }, { email: EMAIL })
  assert.strictEqual(sent, 0, 'the send must still be rate limited after the prune')
})

test('the processor binding prunes the admin table against the real clock', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const user = await makeAdmin(app)
  const stale = await insertCode(user, new Date(Date.now() - ADMIN_OTP_RETENTION_MS - HOUR))
  const fresh = await insertCode(user, new Date(Date.now() - HOUR))
  assert.deepStrictEqual(await buildProcessors(app)['prune-auth-otps']({ tick_id: 'test' }), { pruned: 0, pruned_admin: 1 })
  assert.deepStrictEqual(await surviving([stale, fresh]), [fresh])
})
