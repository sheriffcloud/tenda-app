/**
 * Approval-mode action visibility. Every predicate here mirrors a guard the
 * server and the chain re-check, so a wrong answer either offers a button whose
 * transaction reverts, or hides an action the user is entitled to.
 *
 * The tests are written against the invariants the source states rather than
 * around the implementation: the exact-boundary agreements, the "changing your
 * mind is the point" rule for re-applying, and the delivery-window bound on
 * releasing — which the source calls load-bearing because without it, ghosting
 * then releasing beats the honest early exit the feature exists to reward.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canApply,
  canWithdrawApplication,
  canAssign,
  assignmentAcceptedAt,
  unassignWindowEndsAt,
  canUnassign,
  canReleaseAssignment,
  acceptWindowState,
} from '../../src/utils/gig-utils'
import type { ApplicationLike } from '../../src/utils/gig-utils'
import {
  APPLICATION_STATUSES,
  APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS,
} from '../../src/constants/applications'
import type { ApplicationStatus } from '../../src/constants/applications'
import type { EscrowStatus } from '../../src/types/escrow'

const CREATOR = 'user-creator'
const WORKER = 'user-worker'
const STRANGER = 'user-stranger'

const NOW = new Date('2026-06-10T12:00:00.000Z')
const SECOND = 1_000
const HOUR = 60 * 60 * SECOND
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow)

/** An approval-mode escrow. Mode is stated, never defaulted — it is required. */
function approvalEscrow(status: EscrowStatus, counterparty: string | null = null) {
  return {
    status,
    creator_id: CREATOR,
    counterparty_id: counterparty,
    requires_approval: true,
    is_assigned: counterparty !== null,
    assigned_counterparty_id: counterparty,
    hidden: false,
  }
}

const application = (status: ApplicationStatus): ApplicationLike => ({ status })

// --- canApply --------------------------------------------------------------

test('canApply: a stranger may apply to an open approval-mode gig', () => {
  assert.equal(canApply(approvalEscrow('open'), WORKER, null), true)
})

test('canApply: the poster may never apply to their own gig', () => {
  assert.equal(canApply(approvalEscrow('open'), CREATOR, null), false)
})

test('canApply: instant-mode gigs are not applied to at all', () => {
  const instant = { ...approvalEscrow('open'), requires_approval: false }
  assert.equal(canApply(instant, WORKER, null), false)
})

test('canApply: only an OPEN gig takes applications', () => {
  for (const status of ['draft', 'accepted', 'submitted', 'completed', 'cancelled'] as const) {
    assert.equal(
      canApply(approvalEscrow(status), WORKER, null),
      false,
      `expected no applying to a ${status} gig`,
    )
  }
})

/**
 * The rule the source spells out: a live application blocks, a settled one does
 * not. Offering "Apply" over a live application tells the worker their earlier
 * one did not count; refusing it after they withdrew denies them the change of
 * mind the upsert exists for.
 */
test('canApply: an OPEN application blocks re-applying', () => {
  assert.equal(canApply(approvalEscrow('open'), WORKER, application('open')), false)
})

test('canApply: every settled application status allows re-applying', () => {
  const settled = APPLICATION_STATUSES.filter((s) => s !== 'open')
  assert.ok(settled.length > 0, 'expected statuses other than open')
  for (const status of settled) {
    assert.equal(
      canApply(approvalEscrow('open'), WORKER, application(status)),
      true,
      `expected re-applying to be allowed after '${status}'`,
    )
  }
})

// --- canWithdrawApplication ------------------------------------------------
//
// Judged on the application ALONE, deliberately blind to the escrow — which is
// also what makes it survive a CO1 takedown: an applicant on a gig that was
// pulled must still be able to pull out, and the server agrees (DELETE reads
// the application, and /v1/applications keeps listing hidden gigs so the exit
// never dead-ends). That is a property of the SIGNATURE, not of a value any
// test can vary, so it is recorded here rather than as a test that would assert
// the same `true` as the one below and could never fail.

test('canWithdrawApplication: only an open application can be withdrawn', () => {
  assert.equal(canWithdrawApplication(application('open')), true)
  const settled = APPLICATION_STATUSES.filter((s) => s !== 'open')
  assert.ok(settled.length > 0, 'expected statuses other than open')
  for (const status of settled) {
    assert.equal(
      canWithdrawApplication(application(status)),
      false,
      `expected '${status}' not to be withdrawable — the route answers 409`,
    )
  }
})

test('canWithdrawApplication: no application means nothing to withdraw', () => {
  assert.equal(canWithdrawApplication(null), false)
})

// --- canAssign -------------------------------------------------------------

const assignable = (accept_deadline: string | Date | null) => ({
  ...approvalEscrow('open'),
  accept_deadline,
})

test('canAssign: the poster may assign before the accept deadline', () => {
  assert.equal(canAssign(assignable(at(HOUR)), CREATOR, NOW), true)
})

test('canAssign: nobody but the poster may assign', () => {
  for (const user of [WORKER, STRANGER]) {
    assert.equal(canAssign(assignable(at(HOUR)), user, NOW), false, `expected ${user} refused`)
  }
})

test('canAssign: a gig with no accept deadline never closes', () => {
  assert.equal(canAssign(assignable(null), CREATOR, NOW), true)
})

test('canAssign: past the accept deadline the chain refuses, so the button does', () => {
  assert.equal(canAssign(assignable(at(-SECOND)), CREATOR, NOW), false)
})

/**
 * The boundary the source calls out explicitly: `now <= deadline`. One second
 * either side must differ, or the guard is not actually at the deadline.
 */
test('canAssign: exactly ON the deadline still allows assigning', () => {
  assert.equal(canAssign(assignable(NOW), CREATOR, NOW), true)
  assert.equal(canAssign(assignable(at(-1)), CREATOR, NOW), false)
})

test('canAssign: accepts an ISO string as readily as a Date', () => {
  assert.equal(canAssign(assignable(at(HOUR).toISOString()), CREATOR, NOW), true)
})

// --- assignmentAcceptedAt / unassignWindowEndsAt ---------------------------

const timing = (over: Partial<Parameters<typeof assignmentAcceptedAt>[0]> = {}) => ({
  completion_deadline: at(24 * HOUR),
  completion_duration_seconds: 24 * 60 * 60,
  unassign_window_seconds: 2 * 60 * 60,
  ...over,
})

test('assignmentAcceptedAt derives the accept time as deadline − duration', () => {
  // Both contracts derive it this way; nothing stores it.
  assert.deepEqual(assignmentAcceptedAt(timing()), NOW)
})

test('assignmentAcceptedAt is null when either input is unknown', () => {
  assert.equal(assignmentAcceptedAt(timing({ completion_deadline: null })), null)
  assert.equal(assignmentAcceptedAt(timing({ completion_duration_seconds: null })), null)
})

test('unassignWindowEndsAt adds the window to the derived accept time', () => {
  assert.deepEqual(unassignWindowEndsAt(timing()), at(2 * HOUR))
})

test('unassignWindowEndsAt is null when the accept time cannot be derived', () => {
  assert.equal(unassignWindowEndsAt(timing({ completion_deadline: null })), null)
})

test('unassignWindowEndsAt honours the escrow’s own window length', () => {
  // Not a constant: a per-escrow field, so a changed window must move the end.
  assert.deepEqual(unassignWindowEndsAt(timing({ unassign_window_seconds: 30 * 60 })), at(HOUR / 2))
})

// --- canUnassign -----------------------------------------------------------

const unassignable = (over = {}) => ({
  ...approvalEscrow('accepted', WORKER),
  ...timing(),
  ...over,
})

test('canUnassign: the poster may unassign inside the window', () => {
  assert.equal(canUnassign(unassignable(), CREATOR, NOW), true)
})

test('canUnassign: only the poster, and only on an accepted gig', () => {
  assert.equal(canUnassign(unassignable(), WORKER, NOW), false)
  assert.equal(canUnassign(unassignable(), STRANGER, NOW), false)
  for (const status of ['open', 'submitted', 'completed', 'disputed'] as const) {
    assert.equal(
      canUnassign(unassignable({ status }), CREATOR, NOW),
      false,
      `expected no unassign on a ${status} gig`,
    )
  }
})

/**
 * `requires_approval` is the chain's own witness that the worker never signed.
 * Yanking a worker who DID sign is a transition both contracts reject.
 */
test('canUnassign: instant mode is refused — that worker signed', () => {
  assert.equal(canUnassign(unassignable({ requires_approval: false }), CREATOR, NOW), false)
})

test('canUnassign: strictly before the window ends', () => {
  const endsAt = unassignWindowEndsAt(timing())
  assert.ok(endsAt !== null)
  assert.equal(canUnassign(unassignable(), CREATOR, new Date(endsAt.getTime() - 1)), true)
  // Exactly ON the boundary is refused, matching the server's guard.
  assert.equal(canUnassign(unassignable(), CREATOR, endsAt), false)
  assert.equal(canUnassign(unassignable(), CREATOR, new Date(endsAt.getTime() + 1)), false)
})

test('canUnassign: unknown timing refuses rather than guessing', () => {
  assert.equal(canUnassign(unassignable({ completion_deadline: null }), CREATOR, NOW), false)
})

// --- canReleaseAssignment --------------------------------------------------

const GRACE = 60 * 60 // 1h
const releasable = (over = {}) => ({
  ...approvalEscrow('accepted', WORKER),
  completion_deadline: at(4 * HOUR),
  assignment_released_at: null as string | Date | null,
  ...over,
})

test('canReleaseAssignment: the assigned worker may step back', () => {
  assert.equal(canReleaseAssignment(releasable(), WORKER, GRACE, NOW), true)
})

test('canReleaseAssignment: nobody else may release', () => {
  for (const user of [CREATOR, STRANGER]) {
    assert.equal(canReleaseAssignment(releasable(), user, GRACE, NOW), false, `expected ${user} refused`)
  }
})

test('canReleaseAssignment: does not re-arm once stamped', () => {
  // The CTA disappears rather than lying about a second release doing anything.
  const released = releasable({ assignment_released_at: at(-HOUR).toISOString() })
  assert.equal(canReleaseAssignment(released, WORKER, GRACE, NOW), false)
})

test('canReleaseAssignment: approval mode and accepted status only', () => {
  assert.equal(canReleaseAssignment(releasable({ requires_approval: false }), WORKER, GRACE, NOW), false)
  for (const status of ['open', 'submitted', 'completed'] as const) {
    assert.equal(canReleaseAssignment(releasable({ status }), WORKER, GRACE, NOW), false, status)
  }
})

/**
 * The bound the source calls load-bearing. Unbounded, a worker could ghost the
 * entire delivery window and release just before the poster reclaims, dodging
 * the abandonment strike — making ghosting-then-releasing strictly better than
 * the honest early exit. This is the test that would fail if the bound were
 * dropped for looking tidy.
 */
test('canReleaseAssignment: closes with the delivery window, so ghosting cannot dodge the strike', () => {
  const e = releasable()
  const endsAt = at(4 * HOUR + GRACE * SECOND)
  assert.equal(canReleaseAssignment(e, WORKER, GRACE, new Date(endsAt.getTime() - 1)), true)
  // Strictly before, matching `submit` — the worker's two mutually-exclusive
  // moves close together, leaving no gap in either direction.
  assert.equal(canReleaseAssignment(e, WORKER, GRACE, endsAt), false)
  assert.equal(canReleaseAssignment(e, WORKER, GRACE, new Date(endsAt.getTime() + 1)), false)
})

test('canReleaseAssignment: the grace period genuinely extends the window', () => {
  const e = releasable()
  const justPastDeadline = at(4 * HOUR + SECOND)
  assert.equal(canReleaseAssignment(e, WORKER, GRACE, justPastDeadline), true)
  assert.equal(canReleaseAssignment(e, WORKER, 0, justPastDeadline), false)
})

test('canReleaseAssignment: an open-ended gig never closes the window', () => {
  assert.equal(
    canReleaseAssignment(releasable({ completion_deadline: null }), WORKER, GRACE, at(1e12)),
    true,
  )
})

// --- acceptWindowState -----------------------------------------------------

const TIGHT_MS = APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS * SECOND

test('acceptWindowState: plenty of room is open', () => {
  assert.equal(acceptWindowState({ accept_deadline: at(TIGHT_MS + HOUR) }, NOW), 'open')
})

test('acceptWindowState: an indefinitely-open gig has no clock to run out', () => {
  assert.equal(acceptWindowState({ accept_deadline: null }, NOW), 'open')
})

test('acceptWindowState: inside the tight window it warns', () => {
  assert.equal(acceptWindowState({ accept_deadline: at(TIGHT_MS - SECOND) }, NOW), 'closing')
  assert.equal(acceptWindowState({ accept_deadline: at(HOUR) }, NOW), 'closing')
})

test('acceptWindowState: past the deadline no replacement is possible', () => {
  assert.equal(acceptWindowState({ accept_deadline: at(-SECOND) }, NOW), 'closed')
})

test('acceptWindowState: the tight-window boundary is exact', () => {
  // Derived from the constant, so a changed policy moves the test with it
  // rather than silently making this assert the wrong threshold.
  assert.equal(acceptWindowState({ accept_deadline: at(TIGHT_MS) }, NOW), 'open')
  assert.equal(acceptWindowState({ accept_deadline: at(TIGHT_MS - 1) }, NOW), 'closing')
})

/**
 * The cross-helper invariant the source names: "two helpers in this file
 * disagreeing about the same instant is how a screen ends up warning 'you
 * cannot assign anyone' beside a live Assign button."
 */
test('acceptWindowState agrees with canAssign at the exact deadline', () => {
  const onDeadline = { ...approvalEscrow('open'), accept_deadline: NOW }
  assert.equal(canAssign(onDeadline, CREATOR, NOW), true)
  assert.notEqual(
    acceptWindowState(onDeadline, NOW),
    'closed',
    'canAssign says yes on the deadline, so the window must not read closed',
  )
})

test('acceptWindowState never reports closed while canAssign still allows it', () => {
  let assignable = 0
  for (const offset of [-2 * TIGHT_MS, -HOUR, -1, 0, 1, HOUR, TIGHT_MS, 2 * TIGHT_MS]) {
    const e = { ...approvalEscrow('open'), accept_deadline: at(offset) }
    if (canAssign(e, CREATOR, NOW)) {
      assignable++
      assert.notEqual(acceptWindowState(e, NOW), 'closed', `disagreement at offset ${offset}ms`)
    }
  }
  // Without this the sweep is vacuous: a canAssign that always said no would
  // run zero assertions and pass, which is the exact break it exists to catch.
  assert.ok(assignable > 0, 'no offset was assignable — the sweep asserted nothing')
})

// --- CO1 takedown ----------------------------------------------------------
//
// Approval mode has two ways IN — a worker applies, a poster assigns — and both
// go through `isOpenForApplications`, so both are gated in one place. The ways
// OUT of an assignment that already exists are NOT, because a takedown must
// never trap a party in an escrow holding their money.

const takenDown = <T extends { hidden: boolean }>(e: T): T => ({ ...e, hidden: true })

test('canApply: nobody may apply to a taken-down gig', () => {
  // Same gig, same worker, same absent application — only `hidden` differs.
  assert.equal(canApply(approvalEscrow('open'), WORKER, null), true)
  assert.equal(canApply(takenDown(approvalEscrow('open')), WORKER, null), false)
  assert.equal(canApply(takenDown(approvalEscrow('open')), STRANGER, null), false)
})

test('canAssign: the poster cannot assign from a taken-down gig', () => {
  // The server refuses `assign_accept` on it, so offering the button would
  // walk the poster into a 409 with a worker's name already picked.
  assert.equal(canAssign(assignable(at(HOUR)), CREATOR, NOW), true)
  assert.equal(canAssign(takenDown(assignable(at(HOUR))), CREATOR, NOW), false)
})

test('canUnassign: the poster may still release a worker on a taken-down gig', () => {
  const assigned = {
    ...approvalEscrow('accepted', WORKER),
    completion_deadline: at(HOUR),
    completion_duration_seconds: 3600,
    unassign_window_seconds: 7200,
  }
  assert.equal(canUnassign(assigned, CREATOR, NOW), true)
  assert.equal(canUnassign(takenDown(assigned), CREATOR, NOW), true)
})

test('canReleaseAssignment: the worker may still step back from a taken-down gig', () => {
  const assigned = {
    ...approvalEscrow('accepted', WORKER),
    completion_deadline: at(HOUR),
    assignment_released_at: null,
  }
  assert.equal(canReleaseAssignment(assigned, WORKER, 0, NOW), true)
  assert.equal(canReleaseAssignment(takenDown(assigned), WORKER, 0, NOW), true)
})
