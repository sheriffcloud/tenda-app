/**
 * features/alerts/recipients — who gets paged about a dispute.
 *
 * An integration test because every claim here is about ROWS: which roles
 * postgres returns, whether a suspended admin is filtered, and what happens
 * when the roster is empty. A fake store would assert the query I wrote.
 *
 * The permission-derivation half (`rolesWithPermission` is the exact inverse of
 * `hasPermission`) is already pinned in packages/shared; this file covers what
 * that derivation does once it meets real users.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { hasPermission, ROLE_PERMISSIONS, type AdminRole } from '@tenda/shared'
import { mediatorUserIds } from '@server/features/alerts'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'
import { alertLogSpy, type AlertLogSpy } from '../helpers/alert-log'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()


let log: AlertLogSpy

beforeEach(() => {
  if (skip) return
  log = alertLogSpy()
})

/**
 * A user created AS `role`, optionally suspended.
 *
 * Created in one insert rather than created-then-promoted: `createUser` signs
 * the returned token from the row it inserts, so a later UPDATE would leave
 * `token` claiming 'user' while the row says 'dispute_admin' — a trap for the
 * next test that reaches for it.
 */
async function admin(role: AdminRole, opts: { suspended?: boolean } = {}) {
  return createUser(getApp(), {
    role,
    ...(opts.suspended === true ? { status: 'suspended' as const } : {}),
  })
}

function deps() {
  return { db: getApp().db, log }
}

// ---------- permission derivation, against real rows ---------------------------

test('every role holding disputes.mediate is included', { skip }, async () => {
  // Derived from the registry rather than a literal: if a new mediating role is
  // added, this test covers it without being edited — which is the whole point
  // of building the roster from the permission.
  const mediating = (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).filter((r) =>
    hasPermission(r, 'disputes.mediate'),
  )
  // Also the INVARIANT that keeps recipients.ts's empty-roles branch
  // unreachable. If a registry edit ever strips this permission from every
  // role, this line fails loudly here rather than every dispute alert
  // silently resolving to nobody.
  assert.ok(mediating.length > 0, 'no role holds disputes.mediate — every dispute alert would reach nobody')

  const created = await Promise.all(mediating.map((role) => admin(role)))
  const ids = await mediatorUserIds(deps(), [])

  for (const [i, role] of mediating.entries()) {
    assert.ok(ids.includes(created[i].row.id), `${role} holds disputes.mediate but was not paged`)
  }
})

test('a role WITHOUT disputes.mediate is never paged', { skip }, async () => {
  // A plain user is the case that exists today. If a future admin role lacks
  // the permission, the same assertion covers it.
  const plain = await createUser(getApp())
  const ids = await mediatorUserIds(deps(), [])
  assert.ok(!ids.includes(plain.row.id), "'user' holds no permissions by construction")
})

// ---------- suspension ----------------------------------------------------------

test('a SUSPENDED mediator is excluded — they cannot open what they are paged about', { skip }, async () => {
  // plugins/auth.ts and lib/auth/session.ts both reject a suspended account, so
  // paging one is noise AND makes the roster look staffed when it is not.
  const active = await admin('dispute_admin')
  const locked = await admin('dispute_admin', { suspended: true })

  const ids = await mediatorUserIds(deps(), [])

  assert.ok(ids.includes(active.row.id))
  assert.ok(!ids.includes(locked.row.id), 'a locked-out admin must not count as a recipient')
})

// ---------- party exclusion (G10) ------------------------------------------------

test('an admin who is a party to the escrow is excluded', { skip }, async () => {
  const partyAdmin = await admin('dispute_admin')
  const neutral = await admin('dispute_admin')

  const ids = await mediatorUserIds(deps(), [partyAdmin.row.id])

  assert.deepStrictEqual(ids, [neutral.row.id])
})

test('null entries in the exclude list are ignored, not treated as ids', { skip }, async () => {
  // An unassigned counterparty arrives as null; callers must not have to filter.
  const a = await admin('dispute_admin')
  const ids = await mediatorUserIds(deps(), [null, null])
  assert.ok(ids.includes(a.row.id))
})

test('excluding every mediator yields an empty list and a WARNING, never a throw', { skip }, async () => {
  // The dispute is between the only two admins. Nobody neutral is left — that
  // is an ops fact, not an exception: throwing would fail the whole alert job
  // and take the Slack channel down with it.
  const one = await admin('dispute_admin')
  const two = await admin('super_admin')

  const ids = await mediatorUserIds(deps(), [one.row.id, two.row.id])

  assert.deepStrictEqual(ids, [])
  assert.strictEqual(log.warns.length, 1)
  assert.match(log.warns[0].msg, /no in-app recipients/)
  // The counts are what let ops tell "we have no admins" from "all are parties".
  assert.strictEqual(log.warns[0].obj.found, 2)
  assert.strictEqual(log.warns[0].obj.excluded, 2)
})

// ---------- the empty roster -----------------------------------------------------

test('no mediators at all: empty list, warned, and NOT an error', { skip }, async () => {
  // resetDb leaves no admins, so this is the zero-state a fresh deployment has.
  const ids = await mediatorUserIds(deps(), [])

  assert.deepStrictEqual(ids, [])
  assert.strictEqual(log.warns.length, 1)
  assert.strictEqual(log.warns[0].obj.found, 0)
  assert.strictEqual(log.warns[0].obj.excluded, 0)
})

test('a healthy roster logs NOTHING — the warning must stay a signal', { skip }, async () => {
  // A warning on every successful dispute would be ignored within a week, and
  // then the real one is invisible too.
  await admin('dispute_admin')
  const ids = await mediatorUserIds(deps(), [])

  assert.strictEqual(ids.length, 1)
  assert.deepStrictEqual(log.warns, [])
})

// ---------- shape ----------------------------------------------------------------

test('returns plain user ids, deduped by construction, with no nulls', { skip }, async () => {
  await admin('dispute_admin')
  await admin('super_admin')

  const ids = await mediatorUserIds(deps(), [randomUUID()])

  assert.strictEqual(ids.length, 2)
  assert.strictEqual(new Set(ids).size, ids.length, 'a user cannot be paged twice')
  for (const id of ids) assert.strictEqual(typeof id, 'string')
})
