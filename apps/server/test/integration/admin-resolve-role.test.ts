/**
 * resolveAdminCandidates + setAdminRole (lib/admin-auth.ts) — the lookup +
 * promote cores behind `pnpm admin:grant-email` and `pnpm admin:bootstrap`.
 * resolveAdminCandidates is read-only; setAdminRole PROMOTES only.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { users, user_identities } from '@tenda/shared/db/schema/identity'
import { AppError } from '../../src/lib/errors'
import { resolveAdminCandidates, setAdminRole } from '../../src/lib/admin-auth'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function addEmail(app: ReturnType<typeof getApp>, userId: string, email: string): Promise<void> {
  await app.db
    .insert(user_identities)
    .values({ user_id: userId, kind: 'email', identifier: email, email, verified_at: new Date() })
}
async function addPhone(app: ReturnType<typeof getApp>, userId: string, e164: string): Promise<void> {
  await app.db
    .insert(user_identities)
    .values({ user_id: userId, kind: 'phone', identifier: e164, email: null, verified_at: new Date() })
}

test('resolve: by email (normalised), phone, and uuid', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { role: 'super_admin', first_name: 'Ada', last_name: 'Lovelace' })
  await addEmail(app, u.row.id, 'ada@tenda.app')
  await addPhone(app, u.row.id, '+2348012345678')

  // Email lookup is case/space-insensitive and echoes the normalised match.
  const byEmail = await resolveAdminCandidates(app.db, '  ADA@Tenda.APP ')
  assert.strictEqual(byEmail.length, 1)
  assert.strictEqual(byEmail[0].user_id, u.row.id)
  assert.strictEqual(byEmail[0].matched_via, 'email')
  assert.strictEqual(byEmail[0].matched_identifier, 'ada@tenda.app')
  assert.strictEqual(byEmail[0].role, 'super_admin')

  const byPhone = await resolveAdminCandidates(app.db, '+2348012345678')
  assert.strictEqual(byPhone.length, 1)
  assert.strictEqual(byPhone[0].user_id, u.row.id)
  assert.strictEqual(byPhone[0].matched_via, 'phone')

  const byUuid = await resolveAdminCandidates(app.db, u.row.id)
  assert.strictEqual(byUuid.length, 1)
  assert.strictEqual(byUuid[0].matched_via, 'uuid')
})

test('resolve: no match, junk email, and non-E.164 phone all return []', { skip }, async () => {
  const app = getApp()
  assert.deepStrictEqual(await resolveAdminCandidates(app.db, 'nobody@tenda.app'), [])
  assert.deepStrictEqual(await resolveAdminCandidates(app.db, 'not-an-email'), []) // treated as phone, not E.164
  assert.deepStrictEqual(await resolveAdminCandidates(app.db, '08012345678'), []) // local, no country code
  assert.deepStrictEqual(
    await resolveAdminCandidates(app.db, 'f0e36d8a-0000-0000-0000-000000000000'),
    [],
  )
})

test('resolve: same email on two users is ambiguous → both returned', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app, { role: 'super_admin' })
  const b = await createUser(app)
  // kind=email on one, oauth-style email column on the other → both match.
  await addEmail(app, a.row.id, 'dup@tenda.app')
  await app.db
    .insert(user_identities)
    .values({ user_id: b.row.id, kind: 'google', identifier: `g-${b.row.id}`, email: 'dup@tenda.app', verified_at: new Date() })

  const matches = await resolveAdminCandidates(app.db, 'dup@tenda.app')
  assert.strictEqual(matches.length, 2)
  assert.deepStrictEqual(
    new Set(matches.map((m) => m.user_id)),
    new Set([a.row.id, b.row.id]),
  )
})

test('setAdminRole: promotes user → super_admin, idempotent re-run', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)

  const first = await setAdminRole(app.db, { user_id: u.row.id, role: 'super_admin' })
  assert.deepStrictEqual(first, { user_id: u.row.id, previous_role: 'user', role: 'super_admin' })
  const [row] = await app.db.select({ role: users.role }).from(users).where(eq(users.id, u.row.id))
  assert.strictEqual(row.role, 'super_admin')

  // Idempotent: already super_admin → no-op, previous == new.
  const again = await setAdminRole(app.db, { user_id: u.row.id, role: 'super_admin' })
  assert.deepStrictEqual(again, { user_id: u.row.id, previous_role: 'super_admin', role: 'super_admin' })
})

test('setAdminRole: refuses demotion, unknown user, and bad uuid', { skip }, async () => {
  const app = getApp()
  const root = await createUser(app, { role: 'super_admin' })

  // Demotion super_admin → dispute_admin is refused (must go through the route).
  await assert.rejects(
    setAdminRole(app.db, { user_id: root.row.id, role: 'dispute_admin' }),
    (err: unknown) => err instanceof AppError && err.statusCode === 422,
  )
  // Untouched.
  const [row] = await app.db.select({ role: users.role }).from(users).where(eq(users.id, root.row.id))
  assert.strictEqual(row.role, 'super_admin')

  await assert.rejects(
    setAdminRole(app.db, { user_id: 'f0e36d8a-0000-0000-0000-000000000000', role: 'super_admin' }),
    (err: unknown) => err instanceof AppError && err.statusCode === 404,
  )
  await assert.rejects(
    setAdminRole(app.db, { user_id: 'not-a-uuid', role: 'super_admin' }),
    (err: unknown) => err instanceof AppError && err.statusCode === 422,
  )
})
