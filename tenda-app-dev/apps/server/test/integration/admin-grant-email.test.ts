/**
 * #85 — grantAdminEmail (lib/admin-auth.ts), the core shared by the
 * `pnpm admin:grant-email` bootstrap script and the #87 provisioning
 * surface. Grants LOGIN only — never touches users.role.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { admin_users } from '@tenda/shared/db/schema/identity'
import { AppError } from '../../src/lib/errors'
import { grantAdminEmail, normalizeAdminEmail } from '../../src/lib/admin-auth'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('normalizeAdminEmail: lowercases, trims, rejects junk', () => {
  assert.strictEqual(normalizeAdminEmail('  Ops@Tenda.APP '), 'ops@tenda.app')
  assert.strictEqual(normalizeAdminEmail('no-at-sign.example'), null)
  assert.strictEqual(normalizeAdminEmail('two words@x.com'), null)
  assert.strictEqual(normalizeAdminEmail('a@b'), null) // no TLD dot
  assert.strictEqual(normalizeAdminEmail(''), null)
  assert.strictEqual(normalizeAdminEmail(`${'x'.repeat(250)}@tenda.app`), null) // > 255
})

test('grant: inserts lowercase row for an admin; re-grant rotates the email', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'dispute_admin' })

  const granted = await grantAdminEmail(app.db, {
    user_id: admin.row.id,
    email: 'Mediator@Tenda.APP',
    added_by: null,
  })
  assert.deepStrictEqual(granted, {
    user_id: admin.row.id,
    email: 'mediator@tenda.app',
    role: 'dispute_admin',
  })

  // Rotation: same user, new email — upsert, still one row.
  const root = await createUser(app, { role: 'super_admin' })
  await grantAdminEmail(app.db, {
    user_id: admin.row.id,
    email: 'mediator2@tenda.app',
    added_by: root.row.id,
  })
  const rows = await app.db
    .select()
    .from(admin_users)
    .where(eq(admin_users.user_id, admin.row.id))
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].email, 'mediator2@tenda.app')
  assert.strictEqual(rows[0].added_by, root.row.id)
})

test('grant: refuses non-admin roles, unknown users, bad inputs', { skip }, async () => {
  const app = getApp()
  const plain = await createUser(app)

  await assert.rejects(
    grantAdminEmail(app.db, { user_id: plain.row.id, email: 'x@tenda.app', added_by: null }),
    (err: unknown) => err instanceof AppError && err.statusCode === 422,
  )
  await assert.rejects(
    grantAdminEmail(app.db, {
      user_id: 'f0e36d8a-0000-0000-0000-000000000000',
      email: 'x@tenda.app',
      added_by: null,
    }),
    (err: unknown) => err instanceof AppError && err.statusCode === 404,
  )
  await assert.rejects(
    grantAdminEmail(app.db, { user_id: 'not-a-uuid', email: 'x@tenda.app', added_by: null }),
    (err: unknown) => err instanceof AppError && err.statusCode === 422,
  )
  const admin = await createUser(app, { role: 'super_admin' })
  await assert.rejects(
    grantAdminEmail(app.db, { user_id: admin.row.id, email: 'not-an-email', added_by: null }),
    (err: unknown) => err instanceof AppError && err.statusCode === 422,
  )
  // No rows were written by any refusal.
  const rows = await app.db.select().from(admin_users)
  assert.strictEqual(rows.length, 0)
})

test('grant: email already used by another admin → 409 EMAIL_IN_USE', { skip }, async () => {
  const app = getApp()
  const first = await createUser(app, { role: 'dispute_admin' })
  const second = await createUser(app, { role: 'dispute_admin' })
  await grantAdminEmail(app.db, { user_id: first.row.id, email: 'ops@tenda.app', added_by: null })

  await assert.rejects(
    grantAdminEmail(app.db, { user_id: second.row.id, email: 'OPS@tenda.app', added_by: null }),
    (err: unknown) =>
      err instanceof AppError && err.statusCode === 409 && err.code === 'EMAIL_IN_USE',
  )
})

test('grantAdminEmail: a DB failure that is NOT the email collision is re-thrown as-is (#110)', { skip }, async () => {
  // lib/admin-auth.ts's bare `throw err`, the last line of its catch. The catch
  // exists to turn ONE postgres error — the admin_users.email unique violation
  // — into a 409 EMAIL_IN_USE, and everything else must pass through untouched.
  //
  // Reached deterministically, no race: `added_by` is a FK to users, so naming
  // a user that does not exist makes the insert fail with a FOREIGN KEY
  // violation. Not a unique violation, so `isPostgresUniqueViolation` says no
  // and the rethrow runs.
  //
  // WHAT THIS PROTECTS. If the classifier ever widened — catching by SQLSTATE
  // class, say — an unrelated database fault would be reported to an operator
  // as "email already assigned to another admin", and they would go looking for
  // a duplicate that does not exist.
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })

  await assert.rejects(
    () =>
      grantAdminEmail(app.db, {
        user_id: admin.row.id,
        email: 'ops@tenda.test',
        added_by: '00000000-0000-0000-0000-000000000000',
      }),
    (err: unknown) => {
      // NOT an AppError: the point is that it was not classified at all.
      assert.ok(!(err instanceof AppError), `expected the raw driver error, got ${String(err)}`)
      // Drizzle wraps the driver error, so the words "foreign key" sit on the
      // CAUSE and not on `message` — measured, having first asserted for them
      // here and watched it fail. What the surface text does carry is the query
      // that failed, which is enough to say the error arrived unclassified.
      assert.match(String(err), /insert into "admin_users"/)
      return true
    },
  )

  // ...and nothing was written, so the failure is not half-applied.
  const rows = await app.db.select().from(admin_users).where(eq(admin_users.user_id, admin.row.id))
  assert.deepStrictEqual(rows, [])
})
