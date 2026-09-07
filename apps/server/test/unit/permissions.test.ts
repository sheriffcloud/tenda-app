/**
 * Permission layer (#76): shared PERMISSIONS map invariants + the
 * requirePermission guard in isolation (route wiring is covered by
 * test/integration/admin-permissions.test.ts).
 */
process.env.DATABASE_URL ??= 'postgres://unused/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.SOLANA_RPC_URL ??= 'http://127.0.0.1:8899'
process.env.SOLANA_TREASURY_ADDRESS ??= '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
process.env.SOLANA_PROGRAM_ID ??= '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
process.env.API_BASE_URL ??= 'https://api.tenda.test'

import { test } from 'node:test'
import assert from 'node:assert'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { PERMISSIONS, ROLE_PERMISSIONS, ADMIN_ROLES, type Permission } from '@tenda/shared'
import { requirePermission } from '@server/lib/guards'

// ---------- map invariants --------------------------------------------------

test('permissions: every role grant is a declared permission', () => {
  const declared = new Set<string>(PERMISSIONS)
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const p of perms) {
      assert.ok(declared.has(p), `${role} grants undeclared permission '${p}'`)
    }
  }
})

test('permissions: no duplicate declarations', () => {
  assert.strictEqual(new Set(PERMISSIONS).size, PERMISSIONS.length)
})

test('permissions: every admin role has an entry (exhaustive map)', () => {
  for (const role of ADMIN_ROLES) {
    assert.ok(role in ROLE_PERMISSIONS, `no ROLE_PERMISSIONS entry for '${role}'`)
  }
})

test('permissions: super_admin holds every permission', () => {
  const granted = new Set(ROLE_PERMISSIONS.super_admin)
  for (const p of PERMISSIONS) assert.ok(granted.has(p), `super_admin missing '${p}'`)
})

test('permissions: dispute_admin is scoped to the dispute workflow', () => {
  assert.deepStrictEqual(
    [...ROLE_PERMISSIONS.dispute_admin].sort(),
    ['disputes.mediate', 'disputes.read', 'escrows.read'],
  )
})

// ---------- guard behavior ---------------------------------------------------

function fakeReqReply(role: string) {
  const state = { statusCode: 0, body: undefined as unknown }
  const request = { user: { id: 'u1', role } } as FastifyRequest
  const reply = {
    code(c: number) {
      state.statusCode = c
      return this
    },
    send(b: unknown) {
      state.body = b
      return this
    },
  } as unknown as FastifyReply
  return { request, reply, state }
}

async function runGuard(role: string, permission: Permission) {
  const { request, reply, state } = fakeReqReply(role)
  await requirePermission(permission)(request, reply)
  return state
}

test('requirePermission: grants pass silently', async () => {
  assert.strictEqual((await runGuard('super_admin', 'config.write')).statusCode, 0)
  assert.strictEqual((await runGuard('dispute_admin', 'disputes.read')).statusCode, 0)
})

test('requirePermission: ungranted permission → 403 FORBIDDEN', async () => {
  const state = await runGuard('dispute_admin', 'config.write')
  assert.strictEqual(state.statusCode, 403)
  assert.strictEqual((state.body as { code: string }).code, 'FORBIDDEN')
})

test('requirePermission: unmapped role (user) → 403 for every permission', async () => {
  for (const p of PERMISSIONS) {
    assert.strictEqual((await runGuard('user', p)).statusCode, 403, `user passed '${p}'`)
  }
})
