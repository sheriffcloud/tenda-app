import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  rolesWithPermission,
  type Permission,
} from '../../src/constants/permissions'

test('PERMISSIONS: non-empty and duplicate-free', () => {
  assert.ok(PERMISSIONS.length > 0)
  assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length)
})

test('super_admin holds every permission by construction', () => {
  for (const perm of PERMISSIONS) {
    assert.equal(hasPermission('super_admin', perm), true, `super_admin should hold ${perm}`)
  }
  assert.deepEqual([...ROLE_PERMISSIONS.super_admin], [...PERMISSIONS])
})

test('dispute_admin holds exactly its scoped grants and nothing else', () => {
  const granted: Permission[] = ['disputes.read', 'disputes.mediate', 'escrows.read']
  for (const perm of PERMISSIONS) {
    const expected = granted.includes(perm)
    assert.equal(hasPermission('dispute_admin', perm), expected, `dispute_admin ${perm} should be ${expected}`)
  }
})

test('full role × permission matrix matches ROLE_PERMISSIONS exactly', () => {
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const grantedSet = new Set(perms)
    for (const perm of PERMISSIONS) {
      assert.equal(hasPermission(role, perm), grantedSet.has(perm), `${role} × ${perm}`)
    }
  }
})

test("hasPermission: unmapped roles ('user', unknown, empty) hold the empty set", () => {
  for (const role of ['user', 'ghost_role', '']) {
    for (const perm of PERMISSIONS) {
      assert.equal(hasPermission(role, perm), false, `${role} should not hold ${perm}`)
    }
  }
})

test('rolesWithPermission: returns the mediating roles for disputes.mediate', () => {
  assert.deepEqual(rolesWithPermission('disputes.mediate').sort(), ['dispute_admin', 'super_admin'])
})

test('rolesWithPermission: a permission only super_admin holds returns just super_admin', () => {
  // 'users.suspend' is outside dispute_admin's scoped grant, so this pins that
  // the filter actually discriminates rather than returning every admin role.
  assert.deepEqual(rolesWithPermission('users.suspend'), ['super_admin'])
})

test('rolesWithPermission: is the exact inverse of hasPermission for every pair', () => {
  // The property that matters. Asserting today's roster alone would still pass
  // if the function were hardcoded; this fails the moment the two disagree,
  // whatever roles or permissions exist.
  for (const perm of PERMISSIONS) {
    const holders = new Set<string>(rolesWithPermission(perm))
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      assert.equal(
        holders.has(role),
        hasPermission(role, perm),
        `${role} × ${perm}: rolesWithPermission and hasPermission disagree`,
      )
    }
  }
})

test('rolesWithPermission: never reports a non-admin or unknown role', () => {
  for (const perm of PERMISSIONS) {
    for (const role of rolesWithPermission(perm)) {
      assert.ok(role in ROLE_PERMISSIONS, `${role} is not a role in the registry`)
      assert.notEqual(role as string, 'user', "'user' holds no permissions by construction")
    }
  }
})

test('rolesWithPermission: returns a fresh array the caller cannot use to corrupt the registry', () => {
  const first = rolesWithPermission('disputes.mediate')
  first.length = 0
  assert.deepEqual(rolesWithPermission('disputes.mediate').sort(), ['dispute_admin', 'super_admin'])
})
