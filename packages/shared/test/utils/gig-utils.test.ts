import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRelevantDeadline,
  canPublish,
  canAccept,
  canSubmit,
  canAddProof,
  canApprove,
  canDispute,
  canReview,
  canCancel,
  canClaim,
  canDecline,
  UNRESTRICTED_ACCEPTANCE,
  escrowPartiesOf,
} from '../../src/utils/gig-utils'
import type { EscrowStatus } from '../../src/types/escrow'

const CREATOR = 'user-creator'
const COUNTERPARTY = 'user-counterparty'
const STRANGER = 'user-stranger'

function escrow(status: EscrowStatus, counterparty: string | null = COUNTERPARTY) {
  // Instant mode, stated rather than defaulted: the acceptance mode is a
  // REQUIRED field on the shape precisely so no caller can inherit the wrong
  // one silently, and a fixture is a caller. Same for `hidden`.
  return {
    status,
    creator_id: CREATOR,
    counterparty_id: counterparty,
    hidden: false,
    ...UNRESTRICTED_ACCEPTANCE,
  }
}

/** The same escrow, taken down by an admin. */
function hidden(status: EscrowStatus, counterparty: string | null = COUNTERPARTY) {
  return { ...escrow(status, counterparty), hidden: true }
}

const DEADLINES = {
  accept_deadline: '2026-06-10T00:00:00.000Z',
  completion_deadline: '2026-06-11T00:00:00.000Z',
  approval_deadline: '2026-06-12T00:00:00.000Z',
}

test('computeRelevantDeadline: picks accept_deadline when open', () => {
  const d = computeRelevantDeadline({ status: 'open', ...DEADLINES })
  assert.equal(d?.toISOString(), '2026-06-10T00:00:00.000Z')
})

test('computeRelevantDeadline: picks completion_deadline when accepted', () => {
  const d = computeRelevantDeadline({ status: 'accepted', ...DEADLINES })
  assert.equal(d?.toISOString(), '2026-06-11T00:00:00.000Z')
})

test('computeRelevantDeadline: picks approval_deadline when submitted', () => {
  const d = computeRelevantDeadline({ status: 'submitted', ...DEADLINES })
  assert.equal(d?.toISOString(), '2026-06-12T00:00:00.000Z')
})

test('computeRelevantDeadline: null for other statuses', () => {
  assert.equal(computeRelevantDeadline({ status: 'completed', ...DEADLINES }), null)
  assert.equal(computeRelevantDeadline({ status: 'draft', ...DEADLINES }), null)
})

test('computeRelevantDeadline: open with a null accept_deadline yields null (indefinitely open)', () => {
  assert.equal(computeRelevantDeadline({ status: 'open', ...DEADLINES, accept_deadline: null }), null)
})

test('computeRelevantDeadline: accepts Date inputs as well as ISO strings', () => {
  const d = computeRelevantDeadline({
    status: 'open',
    accept_deadline: new Date('2026-06-10T00:00:00.000Z'),
    completion_deadline: null,
    approval_deadline: null,
  })
  assert.equal(d?.toISOString(), '2026-06-10T00:00:00.000Z')
})

test('canPublish: only the creator on a draft', () => {
  assert.equal(canPublish(escrow('draft'), CREATOR), true)
  assert.equal(canPublish(escrow('draft'), COUNTERPARTY), false)
  assert.equal(canPublish(escrow('open'), CREATOR), false)
})

test('canAccept: any non-creator on an open escrow', () => {
  assert.equal(canAccept(escrow('open', null), COUNTERPARTY), true)
  assert.equal(canAccept(escrow('open', null), CREATOR), false) // cannot accept own
  assert.equal(canAccept(escrow('draft', null), COUNTERPARTY), false)
})

test('canSubmit: only the counterparty on an accepted escrow', () => {
  assert.equal(canSubmit(escrow('accepted'), COUNTERPARTY), true)
  assert.equal(canSubmit(escrow('accepted'), CREATOR), false)
  assert.equal(canSubmit(escrow('open'), COUNTERPARTY), false)
})

test('canAddProof: the counterparty while submitted OR disputed, never others', () => {
  assert.equal(canAddProof(escrow('submitted'), COUNTERPARTY), true)
  // Evidence stays open through a dispute so the mediator can request more.
  assert.equal(canAddProof(escrow('disputed'), COUNTERPARTY), true)
  assert.equal(canAddProof(escrow('submitted'), CREATOR), false)
  assert.equal(canAddProof(escrow('disputed'), CREATOR), false)
  assert.equal(canAddProof(escrow('disputed'), STRANGER), false)
  assert.equal(canAddProof(escrow('accepted'), COUNTERPARTY), false)
  assert.equal(canAddProof(escrow('completed'), COUNTERPARTY), false)
})

test('canApprove: only the creator on a submitted escrow', () => {
  assert.equal(canApprove(escrow('submitted'), CREATOR), true)
  assert.equal(canApprove(escrow('submitted'), COUNTERPARTY), false)
  assert.equal(canApprove(escrow('accepted'), CREATOR), false)
})

test('canDispute: either party while accepted or submitted, not a stranger', () => {
  assert.equal(canDispute(escrow('accepted'), CREATOR), true)
  assert.equal(canDispute(escrow('submitted'), COUNTERPARTY), true)
  assert.equal(canDispute(escrow('accepted'), STRANGER), false)
  assert.equal(canDispute(escrow('open'), CREATOR), false)
})

test('canReview: either party once completed or resolved', () => {
  assert.equal(canReview(escrow('completed'), CREATOR), true)
  assert.equal(canReview(escrow('resolved'), COUNTERPARTY), true)
  assert.equal(canReview(escrow('completed'), STRANGER), false)
  assert.equal(canReview(escrow('submitted'), CREATOR), false)
})

test('canCancel: only the creator on a draft or open escrow', () => {
  assert.equal(canCancel(escrow('draft'), CREATOR), true)
  assert.equal(canCancel(escrow('open'), CREATOR), true)
  assert.equal(canCancel(escrow('open'), COUNTERPARTY), false)
  assert.equal(canCancel(escrow('accepted'), CREATOR), false)
})

test('canClaim: counterparty after the approval_deadline passes, against an injected clock', () => {
  const e = { ...escrow('submitted'), approval_deadline: '2026-06-12T00:00:00.000Z' }
  const afterDeadline = new Date('2026-06-12T00:00:01.000Z')
  const beforeDeadline = new Date('2026-06-11T23:59:59.000Z')
  assert.equal(canClaim(e, COUNTERPARTY, afterDeadline), true)
  assert.equal(canClaim(e, COUNTERPARTY, beforeDeadline), false) // deadline not reached
  assert.equal(canClaim(e, CREATOR, afterDeadline), false) // wrong caller
})

test('canClaim: false when status is not submitted or approval_deadline is null', () => {
  const noDeadline = { ...escrow('submitted'), approval_deadline: null }
  assert.equal(canClaim(noDeadline, COUNTERPARTY, new Date('2030-01-01T00:00:00.000Z')), false)
  const wrongStatus = { ...escrow('accepted'), approval_deadline: '2026-06-12T00:00:00.000Z' }
  assert.equal(canClaim(wrongStatus, COUNTERPARTY, new Date('2030-01-01T00:00:00.000Z')), false)
})

// ── escrowPartiesOf ────────────────────────────────────────────────────────
//
// The ONE projection both detail CTAs feed `canAccept` from. It replaced two
// private copies, and the exchange copy had hardcoded the acceptance mode —
// so the tests that matter are the ones proving each field is READ, not
// assumed. A mutation that drops any of the three must fail here.

const detail = {
  status: 'open' as EscrowStatus,
  creator: { id: CREATOR },
  counterparty: null,
  hidden: false,
  ...UNRESTRICTED_ACCEPTANCE,
}

test('escrowPartiesOf: flattens the user refs and carries the unrestricted mode', () => {
  assert.deepEqual(escrowPartiesOf({ ...detail, counterparty: { id: COUNTERPARTY } }), {
    status: 'open',
    creator_id: CREATOR,
    counterparty_id: COUNTERPARTY,
    requires_approval: false,
    is_assigned: false,
    assigned_counterparty_id: null,
    hidden: false,
  })
})

test('escrowPartiesOf: a null counterparty becomes a null id, not undefined', () => {
  // `canAccept` compares against `counterparty_id`; `undefined` from an
  // optional-chain slip would still be falsy and silently pass every check.
  const parties = escrowPartiesOf(detail)
  assert.equal(parties.counterparty_id, null)
  assert.ok('counterparty_id' in parties)
})

test('escrowPartiesOf: carries BOTH halves of the assignment', () => {
  // What an outsider receives: flag set, id withheld. Carrying only the id
  // would read as unassigned — the exact bug that offered strangers Accept.
  const outsider = escrowPartiesOf({ ...detail, is_assigned: true, assigned_counterparty_id: null })
  assert.equal(outsider.is_assigned, true)
  assert.equal(outsider.assigned_counterparty_id, null)
  assert.equal(canAccept(outsider, STRANGER), false)

  // What the invitee receives, on the same escrow.
  const invitee = escrowPartiesOf({
    ...detail,
    is_assigned: true,
    assigned_counterparty_id: COUNTERPARTY,
  })
  assert.equal(canAccept(invitee, COUNTERPARTY), true)
  assert.equal(canAccept(invitee, STRANGER), false)
})

test('escrowPartiesOf: carries requires_approval rather than assuming it false', () => {
  const approval = escrowPartiesOf({ ...detail, requires_approval: true })
  assert.equal(approval.requires_approval, true)
  assert.equal(canAccept(approval, STRANGER), false)
})

// --- CO1 takedown ----------------------------------------------------------
//
// The rule in one sentence: a hidden escrow takes no new participants and
// gives up none of its existing ones' exits. Both halves are asserted, and the
// second half is the one that matters most — blocking an exit on an escrow
// holding locked funds would strand real money.

test('canAccept: a taken-down listing is closed to everyone', () => {
  // Open, instant mode, nobody assigned — acceptable in every other respect.
  assert.equal(canAccept(escrow('open', null), COUNTERPARTY), true)
  assert.equal(canAccept(hidden('open', null), COUNTERPARTY), false)
  assert.equal(canAccept(hidden('open', null), STRANGER), false)
})

test('canAccept: hidden beats the direct invite — even the named worker', () => {
  // The invitee is the ONE person a direct offer is acceptable by, so if the
  // takedown check were ordered after the assignment check they would slip
  // through. They can still decline (below).
  const invited = escrowPartiesOf({
    ...detail,
    hidden: true,
    is_assigned: true,
    assigned_counterparty_id: COUNTERPARTY,
  })
  assert.equal(canAccept(invited, COUNTERPARTY), false)
})

test('canPublish: a taken-down draft cannot be funded', () => {
  // Publishing a hidden draft would lock the creator's money into an escrow
  // nobody is allowed to accept. Deleting it is a way out and stays available
  // — nothing here gates that.
  assert.equal(canPublish(escrow('draft', null), CREATOR), true)
  assert.equal(canPublish(hidden('draft', null), CREATOR), false)
})

test('canDecline: the invitee may still say no to a taken-down offer', () => {
  const invited = escrowPartiesOf({
    ...detail,
    is_assigned: true,
    assigned_counterparty_id: COUNTERPARTY,
  })
  assert.equal(canDecline(invited, COUNTERPARTY), true)
  // Taken down: accept is gone, decline is NOT. Being pulled out from under
  // someone is not a reason to trap them in the invitation.
  const takenDown = { ...invited, hidden: true }
  assert.equal(canAccept(takenDown, COUNTERPARTY), false)
  assert.equal(canDecline(takenDown, COUNTERPARTY), true)
})

test('canDecline: only the named invitee, only while open', () => {
  const invited = escrowPartiesOf({
    ...detail,
    is_assigned: true,
    assigned_counterparty_id: COUNTERPARTY,
  })
  assert.equal(canDecline(invited, CREATOR), false)
  assert.equal(canDecline(invited, STRANGER), false)
  // Nothing to decline once the escrow has moved on.
  assert.equal(canDecline({ ...invited, status: 'accepted' }, COUNTERPARTY), false)
  // An outsider is served the flag with the id withheld; that must not read as
  // "you are the invitee".
  const withheld = escrowPartiesOf({ ...detail, is_assigned: true, assigned_counterparty_id: null })
  assert.equal(canDecline(withheld, STRANGER), false)
  // No invite at all: nothing to decline.
  assert.equal(canDecline(escrow('open', null), COUNTERPARTY), false)
})

test('every EXIT helper ignores the takedown', () => {
  // Explicit and exhaustive, because "we did not think to gate that one" and
  // "we deliberately left it open" look identical in the source.
  assert.equal(canSubmit(hidden('accepted'), COUNTERPARTY), canSubmit(escrow('accepted'), COUNTERPARTY))
  assert.equal(canApprove(hidden('submitted'), CREATOR), canApprove(escrow('submitted'), CREATOR))
  assert.equal(canCancel(hidden('open'), CREATOR), canCancel(escrow('open'), CREATOR))
  assert.equal(canDispute(hidden('accepted'), CREATOR), canDispute(escrow('accepted'), CREATOR))
  assert.equal(canAddProof(hidden('submitted'), COUNTERPARTY), canAddProof(escrow('submitted'), COUNTERPARTY))
  assert.equal(canReview(hidden('completed'), CREATOR), canReview(escrow('completed'), CREATOR))
  // All of them TRUE in these states, so the equality above is not two falses
  // agreeing with each other.
  assert.equal(canSubmit(hidden('accepted'), COUNTERPARTY), true)
  assert.equal(canApprove(hidden('submitted'), CREATOR), true)
  assert.equal(canCancel(hidden('open'), CREATOR), true)
  assert.equal(canDispute(hidden('accepted'), CREATOR), true)
  assert.equal(canAddProof(hidden('submitted'), COUNTERPARTY), true)
  assert.equal(canReview(hidden('completed'), CREATOR), true)
})

test('canClaim: a stalled worker still gets paid out of a taken-down escrow', () => {
  const past = new Date(Date.now() - 60_000).toISOString()
  const ctx = { ...hidden('submitted'), approval_deadline: past }
  assert.equal(canClaim(ctx, COUNTERPARTY), true)
})
