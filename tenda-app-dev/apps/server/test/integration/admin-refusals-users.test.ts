/**
 * Admin USER and ROLE refusals that no test executed (#105 T5a).
 *
 * The admin surface is where an unexecuted guard costs most, and two of these
 * are not validation at all — they are separation of duties:
 *   users:140  an admin account cannot be suspended through this route.
 *   users:175  you cannot demote yourself — the last super_admin locking
 *              themselves out is unrecoverable without the bootstrap script.
 * Both could be deleted today and the suite would stay green.
 *
 * The rest name their own field, which matters because this surface answers 400
 * from several places with the same code.
 *
 * The standing and admin-mailer half of this tranche is in
 * admin-refusals-standing.test.ts — split to stay under the 300-line rule.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ADMIN_ROLES, ASSIGNABLE_ROLES } from '@tenda/shared'
import { TEST_DB_CONFIGURED, useTestApp, createAdmin, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- GET /v1/admin/users: the role filter --------------------------------

test('admin users: a role filter outside the assignable set is 400', { skip }, async () => {
  // The filter is interpolated into a `where`, so an unrecognised value must be
  // refused rather than silently matching nothing — an admin filtering by a
  // typo would otherwise read an empty list as "no such users".
  const app = getApp()
  const a = await createAdmin(app)

  for (const role of ['moderator', 'support', 'SUPER_ADMIN', 'nonsense']) {
    const res = await app.inject({
      method: 'GET', url: `/v1/admin/users?role=${role}`, headers: authHeader(a.token),
    })
    assert.strictEqual(res.statusCode, 400, role)
    assert.match(res.json().message, /Invalid role filter/)
  }

  // Every assignable role IS accepted, so the 400 is the vocabulary and not a
  // broken filter. 'moderator' and 'support' above are the interesting misses:
  // they read like roles this system has and do not exist in it.
  for (const role of ASSIGNABLE_ROLES) {
    const ok = await app.inject({
      method: 'GET', url: `/v1/admin/users?role=${role}`, headers: authHeader(a.token),
    })
    assert.strictEqual(ok.statusCode, 200, `${role}: ${ok.body}`)
  }
})

// ---------- PATCH /v1/admin/users/:id/status ------------------------------------

test('admin users: a status outside active|suspended is 400', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const target = await createUser(app)

  for (const status of [undefined, '', 'banned', 'ACTIVE', 7]) {
    const res = await app.inject({
      method: 'PATCH', url: `/v1/admin/users/${target.row.id}/status`,
      headers: authHeader(a.token), payload: { status },
    })
    assert.strictEqual(res.statusCode, 400, String(status))
    assert.match(res.json().message, /status must be "active" or "suspended"/)
  }
})

test('admin users: an ADMIN account cannot be suspended, 403', { skip }, async () => {
  // Separation of duties, not validation. Without it any admin with
  // users.suspend could disable a peer — including the super_admin who would
  // otherwise undo it. Both admin roles are covered because the guard tests
  // membership of ADMIN_ROLES, not equality to one of them.
  const app = getApp()
  const a = await createAdmin(app)

  for (const role of ADMIN_ROLES) {
    const peer = await createAdmin(app, role)
    const res = await app.inject({
      method: 'PATCH', url: `/v1/admin/users/${peer.row.id}/status`,
      headers: authHeader(a.token), payload: { status: 'suspended' },
    })
    assert.strictEqual(res.statusCode, 403, role)
    assert.match(res.json().message, /Cannot suspend another admin account/)
  }

  // ...and a plain user CAN be suspended, so the 403 is the admin rule rather
  // than the route being broken.
  const ordinary = await createUser(app)
  const ok = await app.inject({
    method: 'PATCH', url: `/v1/admin/users/${ordinary.row.id}/status`,
    headers: authHeader(a.token), payload: { status: 'suspended' },
  })
  assert.strictEqual(ok.statusCode, 200, ok.body)
  assert.strictEqual(ok.json().status, 'suspended')
})

// ---------- PATCH /v1/admin/users/:id/role --------------------------------------

test('admin users: a role outside the assignable set is 400', { skip }, async () => {
  const app = getApp()
  const a = await createAdmin(app)
  const target = await createUser(app)

  for (const role of [undefined, '', 'moderator', 'root', 5]) {
    const res = await app.inject({
      method: 'PATCH', url: `/v1/admin/users/${target.row.id}/role`,
      headers: authHeader(a.token), payload: { role },
    })
    assert.strictEqual(res.statusCode, 400, String(role))
    assert.match(res.json().message, /role must be one of/)
  }
})

test('admin users: an admin cannot demote their OWN account, 403', { skip }, async () => {
  // The lockout guard. A super_admin who demotes themselves cannot promote
  // themselves back — recovery needs the bootstrap ops script and DATABASE_URL.
  const app = getApp()
  const a = await createAdmin(app)

  const self = await app.inject({
    method: 'PATCH', url: `/v1/admin/users/${a.row.id}/role`,
    headers: authHeader(a.token), payload: { role: 'user' },
  })
  assert.strictEqual(self.statusCode, 403)
  assert.match(self.json().message, /Cannot demote your own account/)

  // The guard is demotion-to-user AND self, so neither half alone trips it:
  // demoting somebody ELSE to 'user' is allowed...
  const other = await createUser(app, { role: 'dispute_admin' })
  const demoteOther = await app.inject({
    method: 'PATCH', url: `/v1/admin/users/${other.row.id}/role`,
    headers: authHeader(a.token), payload: { role: 'user' },
  })
  assert.strictEqual(demoteOther.statusCode, 200, demoteOther.body)

  // ...and changing your OWN role to another admin role is allowed.
  const sidestep = await app.inject({
    method: 'PATCH', url: `/v1/admin/users/${a.row.id}/role`,
    headers: authHeader(a.token), payload: { role: 'dispute_admin' },
  })
  assert.strictEqual(sidestep.statusCode, 200, sidestep.body)
})

/**
 * NOT COVERED, recorded rather than forced:
 *
 *   lib/admin-auth.ts:165  `role must be one of` in `setAdminRole`. Its
 *   parameter is typed `(typeof ADMIN_ROLES)[number]`, so the type already
 *   enumerates the two legal values, and the ONLY production caller —
 *   scripts/bootstrap-super-admin.ts, found by unexporting the function and
 *   reading the compiler's error list, not by searching — narrows with its own
 *   `isAdminRole` type guard before calling. Reaching the throw needs a cast at
 *   the call site, which tests the cast rather than the product. It stays as
 *   defence for a future caller that is not type-checked (a JS consumer, a
 *   value off the wire); deleting it would remove that.
 */
