/**
 * The detail-route-specific read gates (`lib/escrow-detail-scope`): the admin
 * rung on top of party membership, and the private-half projection.
 *
 * The two party rungs themselves are NOT tested here — they live in
 * `escrow-party.ts` beside their SQL twins, over one column list, and are
 * pinned in `escrow-party.test.ts` (including that both representations read
 * the same columns). This file covers only what this module adds.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  canViewHiddenEscrow,
  scopeEscrowPrivateFields,
  type DetailViewer,
} from '@server/lib/escrow-detail-scope'
import type { EscrowPartyColumns } from '@server/lib/escrow-party'

const CREATOR = 'user-creator'
const COUNTERPARTY = 'user-counterparty'
const ASSIGNEE = 'user-assignee'
const STRANGER = 'user-stranger'

function escrow(overrides: Partial<EscrowPartyColumns> = {}): EscrowPartyColumns {
  return {
    creator_id: CREATOR,
    counterparty_id: COUNTERPARTY,
    assigned_counterparty_id: ASSIGNEE,
    ...overrides,
  }
}

const viewer = (id: string, role = 'user'): DetailViewer => ({ id, role })

// ── canViewHiddenEscrow (the TAKEDOWN gate) ─────────────────────────────────

test('canViewHiddenEscrow: the parties of a taken-down escrow still reach it', () => {
  assert.strictEqual(canViewHiddenEscrow(escrow(), viewer(CREATOR)), true)
  assert.strictEqual(canViewHiddenEscrow(escrow(), viewer(COUNTERPARTY)), true)
  assert.strictEqual(canViewHiddenEscrow(escrow(), viewer(ASSIGNEE)), true)
})

test('canViewHiddenEscrow: both admin roles, on an escrow they have no part in', () => {
  // The one gate that reads a role, and both call sites reach it only after
  // `fastify.authenticate` has re-read that role from the DB.
  const foreign = escrow({ counterparty_id: null, assigned_counterparty_id: null })
  assert.strictEqual(canViewHiddenEscrow(foreign, viewer('admin-1', 'dispute_admin')), true)
  assert.strictEqual(canViewHiddenEscrow(foreign, viewer('admin-2', 'super_admin')), true)
})

test('canViewHiddenEscrow: a stranger and an anonymous reader get 404 material', () => {
  assert.strictEqual(canViewHiddenEscrow(escrow(), viewer(STRANGER)), false)
  assert.strictEqual(canViewHiddenEscrow(escrow(), null), false)
})

test('canViewHiddenEscrow: an unrecognised role grants nothing', () => {
  // A role string outside ADMIN_ROLES (a renamed role, a hand-rolled token)
  // must fail closed rather than be treated as privileged.
  assert.strictEqual(canViewHiddenEscrow(escrow(), viewer(STRANGER, 'moderator')), false)
  assert.strictEqual(canViewHiddenEscrow(escrow(), viewer(STRANGER, '')), false)
})

// ── scopeEscrowPrivateFields ────────────────────────────────────────────────

interface Party {
  id: string
}

const FIELDS = {
  counterparty: { id: COUNTERPARTY } as Party,
  proofs: [{ url: 'https://res.cloudinary.test/p1.jpg' }],
  dispute: { reason: 'Work was never delivered' },
}

test('scopeEscrowPrivateFields: a party gets every value unchanged', () => {
  const scoped = scopeEscrowPrivateFields(FIELDS, true)
  assert.deepStrictEqual(scoped, FIELDS)
})

test('scopeEscrowPrivateFields: an outsider gets the withheld forms', () => {
  const scoped = scopeEscrowPrivateFields(FIELDS, false)
  // null / [] / null — states the wire type already has, so no client needs a
  // second code path for "withheld" versus "not there yet".
  assert.deepStrictEqual(scoped, { counterparty: null, proofs: [], dispute: null })
})

test('scopeEscrowPrivateFields: never mutates the caller input', () => {
  const input = {
    counterparty: { id: COUNTERPARTY } as Party,
    proofs: [{ url: 'https://res.cloudinary.test/p1.jpg' }],
    dispute: { reason: 'Work was never delivered' },
  }
  scopeEscrowPrivateFields(input, false)
  scopeEscrowPrivateFields(input, true)
  // The routes build these from live query results and spread the return into
  // one response object; blanking in place would corrupt the source rows.
  assert.deepStrictEqual(input, FIELDS)
})

test('scopeEscrowPrivateFields: the disclosed result is a copy, not the input object', () => {
  const scoped = scopeEscrowPrivateFields(FIELDS, true)
  assert.notStrictEqual(scoped, FIELDS)
})
