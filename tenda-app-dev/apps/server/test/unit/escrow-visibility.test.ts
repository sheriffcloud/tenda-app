/**
 * Shared escrow action-visibility helpers (utils/gig-utils — rewritten at
 * the #34 cutover to the creator/counterparty vocabulary). These gate UI
 * affordances client-side and must mirror the server state machine.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  canAccept,
  canAddProof,
  canApprove,
  canCancel,
  canClaim,
  canDispute,
  canPublish,
  canReview,
  canSubmit,
  computeRelevantDeadline,
  UNRESTRICTED_ACCEPTANCE,
} from '@tenda/shared'
import type { EscrowStatus } from '@tenda/shared'

const CREATOR = 'user-creator'
const COUNTERPARTY = 'user-counterparty'
const STRANGER = 'user-stranger'

function escrow(status: EscrowStatus, counterparty: string | null = COUNTERPARTY) {
  // Instant mode by default — the acceptance mode is REQUIRED on the shape, so
  // these lifecycle tests state it rather than inheriting a silent default.
  // Same for `hidden`: visible unless a test says otherwise.
  return {
    status,
    creator_id: CREATOR,
    counterparty_id: counterparty,
    hidden: false,
    ...UNRESTRICTED_ACCEPTANCE,
  }
}

test('canPublish: only the creator, only on drafts', () => {
  assert.strictEqual(canPublish(escrow('draft'), CREATOR), true)
  assert.strictEqual(canPublish(escrow('draft'), COUNTERPARTY), false)
  assert.strictEqual(canPublish(escrow('open'), CREATOR), false)
})

test('canAccept: any non-creator on open escrows', () => {
  assert.strictEqual(canAccept(escrow('open', null), STRANGER), true)
  assert.strictEqual(canAccept(escrow('open', null), CREATOR), false)
  assert.strictEqual(canAccept(escrow('accepted'), STRANGER), false)
})

test('canSubmit / canAddProof: counterparty only, status-gated', () => {
  assert.strictEqual(canSubmit(escrow('accepted'), COUNTERPARTY), true)
  assert.strictEqual(canSubmit(escrow('accepted'), CREATOR), false)
  assert.strictEqual(canSubmit(escrow('submitted'), COUNTERPARTY), false)
  assert.strictEqual(canAddProof(escrow('submitted'), COUNTERPARTY), true)
  assert.strictEqual(canAddProof(escrow('accepted'), COUNTERPARTY), false)
  assert.strictEqual(canAddProof(escrow('submitted'), STRANGER), false)
})

test('canApprove: creator only, submitted only', () => {
  assert.strictEqual(canApprove(escrow('submitted'), CREATOR), true)
  assert.strictEqual(canApprove(escrow('submitted'), COUNTERPARTY), false)
  assert.strictEqual(canApprove(escrow('accepted'), CREATOR), false)
})

test('canDispute: either party while accepted/submitted; never strangers or terminal states', () => {
  for (const status of ['accepted', 'submitted'] as const) {
    assert.strictEqual(canDispute(escrow(status), CREATOR), true)
    assert.strictEqual(canDispute(escrow(status), COUNTERPARTY), true)
    assert.strictEqual(canDispute(escrow(status), STRANGER), false)
  }
  assert.strictEqual(canDispute(escrow('completed'), CREATOR), false)
  assert.strictEqual(canDispute(escrow('open', null), CREATOR), false)
})

test('canReview: either party after completed/resolved only', () => {
  for (const status of ['completed', 'resolved'] as const) {
    assert.strictEqual(canReview(escrow(status), CREATOR), true)
    assert.strictEqual(canReview(escrow(status), COUNTERPARTY), true)
  }
  assert.strictEqual(canReview(escrow('completed'), STRANGER), false)
  assert.strictEqual(canReview(escrow('submitted'), CREATOR), false)
})

test('canCancel: creator on draft/open only', () => {
  assert.strictEqual(canCancel(escrow('draft', null), CREATOR), true)
  assert.strictEqual(canCancel(escrow('open', null), CREATOR), true)
  assert.strictEqual(canCancel(escrow('open', null), STRANGER), false)
  assert.strictEqual(canCancel(escrow('accepted'), CREATOR), false)
})

test('canClaim: counterparty, submitted, approval window passed', () => {
  const now = new Date('2026-06-04T12:00:00Z')
  const past = '2026-06-04T11:00:00Z'
  const future = '2026-06-04T13:00:00Z'
  assert.strictEqual(
    canClaim({ ...escrow('submitted'), approval_deadline: past }, COUNTERPARTY, now),
    true,
  )
  // Window still open → no claim.
  assert.strictEqual(
    canClaim({ ...escrow('submitted'), approval_deadline: future }, COUNTERPARTY, now),
    false,
  )
  // No deadline recorded → no claim.
  assert.strictEqual(
    canClaim({ ...escrow('submitted'), approval_deadline: null }, COUNTERPARTY, now),
    false,
  )
  // Wrong party / wrong status.
  assert.strictEqual(
    canClaim({ ...escrow('submitted'), approval_deadline: past }, CREATOR, now),
    false,
  )
  assert.strictEqual(
    canClaim({ ...escrow('accepted'), approval_deadline: past }, COUNTERPARTY, now),
    false,
  )
})

test('computeRelevantDeadline: picks per status, null otherwise', () => {
  const deadlines = {
    accept_deadline: '2026-06-01T00:00:00.000Z',
    completion_deadline: '2026-06-02T00:00:00.000Z',
    approval_deadline: '2026-06-03T00:00:00.000Z',
  }
  assert.strictEqual(
    computeRelevantDeadline({ status: 'open', ...deadlines })?.toISOString(),
    deadlines.accept_deadline,
  )
  assert.strictEqual(
    computeRelevantDeadline({ status: 'accepted', ...deadlines })?.toISOString(),
    deadlines.completion_deadline,
  )
  assert.strictEqual(
    computeRelevantDeadline({ status: 'submitted', ...deadlines })?.toISOString(),
    deadlines.approval_deadline,
  )
  assert.strictEqual(computeRelevantDeadline({ status: 'completed', ...deadlines }), null)
  // Indefinitely-open gig.
  assert.strictEqual(
    computeRelevantDeadline({ status: 'open', ...deadlines, accept_deadline: null }),
    null,
  )
})

// `isGigAcceptable` was deleted with these tests: no caller anywhere in the
// workspace, and it answered the PRE-Stage-10 acceptance question — yes on an
// approval-mode gig — under a more inviting name than `canAccept`. Both halves
// of what it did are covered above (`canAccept`) and in
// approval-visibility.test.ts (`acceptWindowState`).
