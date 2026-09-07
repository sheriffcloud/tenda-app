/**
 * Pure-helper tests for lib/escrow-routes.ts. `loadEscrowOr404` and
 * `guardTransition` need a real Drizzle db so they're covered by route
 * integration tests once the v2 schema lands at #34.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import {
  type EscrowRow,
  buildContext,
  deriveCaller,
  requireCaller,
} from '@server/lib/escrow-routes'

const T0 = new Date('2026-05-20T12:00:00Z')
const T_FUTURE = new Date('2026-06-20T12:00:00Z')

function row(over: Partial<EscrowRow> = {}): EscrowRow {
  // Cast-free fixture: build the row with explicit fields. We don't run
  // it against a real DB so partial completeness is fine — the type-system
  // check happens at each accessor site.
  return {
    id: 'escrow-1',
    creation_operation_id: null,
    kind: 'gig',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '1000000',
    creator_id: 'user-creator',
    counterparty_id: null,
    assigned_counterparty_id: null,
    status: 'open',
    hidden: false,
    escrow_ref: null,
    escrow_contract: null,
    accept_deadline: T_FUTURE,
    completion_duration_seconds: 86400,
    completion_deadline: T_FUTURE,
    submitted_at: null,
    approval_deadline: T_FUTURE,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    assigned_from_application: false,
    assignment_released_at: null,
    unassign_window_seconds: 0,
    sponsored_tx_used: 0,
    public_feed_revision: '0',
    created_at: T0,
    updated_at: T0,
    ...over,
  }
}

// ---------- deriveCaller ------------------------------------------------

test('deriveCaller: creator match → creator', () => {
  assert.strictEqual(
    deriveCaller({ user_id: 'user-creator', role: 'user', escrow: row() }),
    'creator',
  )
})

test('deriveCaller: counterparty match takes precedence over assigned (post-accept canonical role)', () => {
  // Post-accept rows may keep `assigned_counterparty_id` populated. The
  // user IS now the counterparty — state machine for submit/approve/claim/
  // dispute/reclaim_abandoned only accepts 'counterparty' for that user.
  const e = row({
    assigned_counterparty_id: 'user-cp',
    counterparty_id: 'user-cp',
  })
  assert.strictEqual(deriveCaller({ user_id: 'user-cp', role: 'user', escrow: e }), 'counterparty')
})

test('deriveCaller: assigned match (no counterparty yet) → assigned_counterparty (pre-accept)', () => {
  const e = row({ assigned_counterparty_id: 'user-cp', counterparty_id: null })
  assert.strictEqual(deriveCaller({ user_id: 'user-cp', role: 'user', escrow: e }), 'assigned_counterparty')
})

test('deriveCaller: counterparty match (no assignment) → counterparty', () => {
  const e = row({ counterparty_id: 'user-cp' })
  assert.strictEqual(deriveCaller({ user_id: 'user-cp', role: 'user', escrow: e }), 'counterparty')
})

test('deriveCaller: dispute_admin role → dispute_admin (no party match)', () => {
  assert.strictEqual(
    deriveCaller({ user_id: 'user-x', role: 'dispute_admin', escrow: row() }),
    'dispute_admin',
  )
})

test('deriveCaller: unrelated user → null', () => {
  assert.strictEqual(
    deriveCaller({ user_id: 'user-x', role: 'user', escrow: row() }),
    null,
  )
})

test('deriveCaller: creator who is also dispute_admin → creator (party match wins)', () => {
  assert.strictEqual(
    deriveCaller({ user_id: 'user-creator', role: 'dispute_admin', escrow: row() }),
    'creator',
  )
})

// ---------- requireCaller ----------------------------------------------

test('requireCaller: matched caller returns the role', () => {
  assert.strictEqual(
    requireCaller({ user_id: 'user-creator', role: 'user', escrow: row() }),
    'creator',
  )
})

test('requireCaller: unmatched user throws 403 ESCROW_WRONG_CALLER', () => {
  try {
    requireCaller({ user_id: 'user-x', role: 'user', escrow: row() })
    assert.fail('expected throw')
  } catch (err) {
    if (!(err instanceof AppError)) throw err
    assert.strictEqual(err.statusCode, 403)
    assert.strictEqual(err.code, 'ESCROW_WRONG_CALLER')
  }
})

// ---------- buildContext ------------------------------------------------

test('buildContext: copies deadlines + status + assignment flag', () => {
  const e = row({ assigned_counterparty_id: 'user-cp' })
  const ctx = buildContext({
    escrow: e,
    caller: 'creator',
    now: T0,
    grace_period_seconds: 3600,
  })
  assert.strictEqual(ctx.status, 'open')
  assert.strictEqual(ctx.caller, 'creator')
  assert.strictEqual(ctx.now, T0)
  assert.strictEqual(ctx.accept_deadline, T_FUTURE)
  assert.strictEqual(ctx.completion_deadline, T_FUTURE)
  assert.strictEqual(ctx.approval_deadline, T_FUTURE)
  assert.strictEqual(ctx.grace_period_seconds, 3600)
  assert.strictEqual(ctx.is_assigned, true)
})

test('buildContext: is_assigned false when assigned_counterparty_id is null', () => {
  const ctx = buildContext({
    escrow: row({ assigned_counterparty_id: null }),
    caller: 'creator',
    now: T0,
    grace_period_seconds: 3600,
  })
  assert.strictEqual(ctx.is_assigned, false)
})

// buildContext's schema-drift guard (status not in EscrowStatus union →
// INTERNAL_ERROR) can only fire if the DB sends an unexpected value. The
// TS enum makes the path uncatchable from typed test code, so we'd need a
// cast to exercise it — which the project rule forbids. The guard is pure
// defense-in-depth + a marker for future contributors.
