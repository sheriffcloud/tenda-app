/**
 * Shared approval-mode visibility helpers (utils/gig-utils/approval + the
 * mode-aware `canAccept`).
 *
 * These gate what the mobile CTA offers, and every one of them mirrors a guard
 * the server and the contracts re-check. A helper that says yes where the
 * chain says no costs a worker gas to discover, which is why the negative
 * cases here outnumber the positive ones.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS,
  assignmentAcceptedAt,
  canAccept,
  canApply,
  canAssign,
  canReleaseAssignment,
  canUnassign,
  canWithdrawApplication,
  acceptWindowState,
  unassignWindowEndsAt,
  UNRESTRICTED_ACCEPTANCE,
  type ApplicationStatus,
  type EscrowStatus,
} from '@tenda/shared'

const CREATOR = 'user-creator'
const WORKER = 'user-worker'
const STRANGER = 'user-stranger'

const NOW = new Date('2026-07-27T12:00:00.000Z')
const SECOND = 1000

function inFuture(seconds: number): string {
  return new Date(NOW.getTime() + seconds * SECOND).toISOString()
}
function inPast(seconds: number): string {
  return new Date(NOW.getTime() - seconds * SECOND).toISOString()
}

interface EscrowOverrides {
  status?: EscrowStatus
  counterparty_id?: string | null
  requires_approval?: boolean
  assigned_counterparty_id?: string | null
  /**
   * Only for the redacted-outsider shape (assigned, id withheld). Left alone,
   * it is derived from the id so no test can build a gig the server could
   * never send.
   */
  is_assigned?: boolean
  accept_deadline?: string | null
  /** Seconds ago the assignment landed; drives the derived accepted_at. */
  assignedSecondsAgo?: number
  unassign_window_seconds?: number
  assignment_released_at?: string | null
}

const DURATION_SECONDS = 3600

function escrow(o: EscrowOverrides = {}) {
  const assignedSecondsAgo = o.assignedSecondsAgo ?? 60
  const assigned_counterparty_id = o.assigned_counterparty_id ?? null
  return {
    status: o.status ?? 'open',
    creator_id: CREATOR,
    counterparty_id: o.counterparty_id ?? null,
    requires_approval: o.requires_approval ?? true,
    is_assigned: o.is_assigned ?? assigned_counterparty_id !== null,
    assigned_counterparty_id,
    // Always visible here, with no override to vary it: this suite mirrors the
    // shared helpers' APPROVAL rules, and the takedown half of the same helpers
    // is asserted in packages/shared/test/utils/gig-approval.test.ts. An
    // override nothing sets is dead API whose comment promises coverage this
    // file does not have.
    hidden: false,
    accept_deadline: o.accept_deadline ?? null,
    completion_duration_seconds: DURATION_SECONDS,
    // Both contracts derive accepted_at as completion_deadline - duration, so
    // the fixture works backwards from the same relationship.
    completion_deadline: inFuture(DURATION_SECONDS - assignedSecondsAgo),
    unassign_window_seconds: o.unassign_window_seconds ?? 3600,
    assignment_released_at: o.assignment_released_at ?? null,
  }
}

function application(status: ApplicationStatus): { status: ApplicationStatus } {
  return { status }
}

// ── canAccept: the mode-blindness fix ───────────────────────────────────────

test('canAccept: refuses an approval-mode gig — the chain reverts that accept', () => {
  assert.strictEqual(canAccept(escrow({ requires_approval: true }), STRANGER), false)
  // Same escrow in instant mode is acceptable, so the mode is what decided it.
  assert.strictEqual(canAccept(escrow({ requires_approval: false }), STRANGER), true)
})

test('canAccept: a direct invite is acceptable ONLY by the named worker', () => {
  const invited = escrow({ requires_approval: false, assigned_counterparty_id: WORKER })
  assert.strictEqual(canAccept(invited, WORKER), true)
  assert.strictEqual(canAccept(invited, STRANGER), false)
})

test('canAccept: a direct invite whose assignee is WITHHELD is still nobody elses', () => {
  // Exactly what /v1/gigs/:id sends an outsider: the gig is spoken for, but
  // the assignee's user id is party-only, so it arrives null. Judged on the id
  // alone this reads as "open to anyone" and offers a stranger an Accept
  // button whose transaction both contracts revert — the leak fix reintroducing
  // the mode-blindness bug this helper exists to prevent.
  const redacted = escrow({
    requires_approval: false,
    assigned_counterparty_id: null,
    is_assigned: true,
  })
  assert.strictEqual(canAccept(redacted, STRANGER), false)
  // And nobody is let through by it — not even the real assignee, who would
  // only ever receive this shape if the server had mis-scoped their own gig.
  assert.strictEqual(canAccept(redacted, WORKER), false)
})

test('canAccept: never the creator, never off `open`', () => {
  assert.strictEqual(canAccept(escrow({ requires_approval: false }), CREATOR), false)
  assert.strictEqual(
    canAccept(escrow({ requires_approval: false, status: 'accepted' }), STRANGER),
    false,
  )
})

test('UNRESTRICTED_ACCEPTANCE describes an escrow with no mode at all', () => {
  assert.deepStrictEqual(UNRESTRICTED_ACCEPTANCE, {
    requires_approval: false,
    is_assigned: false,
    assigned_counterparty_id: null,
  })
})

// ── canApply ────────────────────────────────────────────────────────────────

test('canApply: a stranger may raise their hand on an open approval-mode gig', () => {
  assert.strictEqual(canApply(escrow(), STRANGER, null), true)
})

test('canApply: never the poster, never an instant-mode gig, never once closed', () => {
  assert.strictEqual(canApply(escrow(), CREATOR, null), false)
  assert.strictEqual(canApply(escrow({ requires_approval: false }), STRANGER, null), false)
  assert.strictEqual(canApply(escrow({ status: 'accepted' }), STRANGER, null), false)
})

test('canApply: an OPEN application blocks it; a settled one does not', () => {
  assert.strictEqual(canApply(escrow(), STRANGER, application('open')), false)
  // Changing your mind is exactly what the server's upsert is for.
  assert.strictEqual(canApply(escrow(), STRANGER, application('withdrawn')), true)
  assert.strictEqual(canApply(escrow(), STRANGER, application('expired')), true)
})

// ── canWithdrawApplication ──────────────────────────────────────────────────

test('canWithdrawApplication: only an open row, mirroring the DELETE route', () => {
  assert.strictEqual(canWithdrawApplication(application('open')), true)
  assert.strictEqual(canWithdrawApplication(application('passed')), false)
  assert.strictEqual(canWithdrawApplication(application('assigned')), false)
  assert.strictEqual(canWithdrawApplication(null), false)
})

// ── canAssign ───────────────────────────────────────────────────────────────

test('canAssign: the poster, on an open approval-mode gig', () => {
  assert.strictEqual(canAssign(escrow(), CREATOR, NOW), true)
  assert.strictEqual(canAssign(escrow(), STRANGER, NOW), false)
  assert.strictEqual(canAssign(escrow({ requires_approval: false }), CREATOR, NOW), false)
})

test('canAssign: refused past accept_deadline — the escrow is on the refund path', () => {
  assert.strictEqual(canAssign(escrow({ accept_deadline: inPast(1) }), CREATOR, NOW), false)
  assert.strictEqual(canAssign(escrow({ accept_deadline: inFuture(1) }), CREATOR, NOW), true)
  // No deadline at all means indefinitely open, not expired.
  assert.strictEqual(canAssign(escrow({ accept_deadline: null }), CREATOR, NOW), true)
})

// ── the unassign window ─────────────────────────────────────────────────────

test('assignmentAcceptedAt derives the contracts own accepted_at', () => {
  const e = escrow({ assignedSecondsAgo: 120 })
  const acceptedAt = assignmentAcceptedAt(e)
  assert.notStrictEqual(acceptedAt, null)
  assert.strictEqual(acceptedAt?.getTime(), NOW.getTime() - 120 * SECOND)
})

test('assignmentAcceptedAt is null when the timing is unknown', () => {
  assert.strictEqual(
    assignmentAcceptedAt({
      completion_deadline: null,
      completion_duration_seconds: DURATION_SECONDS,
      unassign_window_seconds: 60,
    }),
    null,
  )
  assert.strictEqual(
    assignmentAcceptedAt({
      completion_deadline: inFuture(60),
      completion_duration_seconds: null,
      unassign_window_seconds: 60,
    }),
    null,
  )
})

test('unassignWindowEndsAt is accepted_at + the escrows OWN window', () => {
  const e = escrow({ assignedSecondsAgo: 100, unassign_window_seconds: 900 })
  assert.strictEqual(unassignWindowEndsAt(e)?.getTime(), NOW.getTime() - 100 * SECOND + 900 * SECOND)
})

test('canUnassign: the poster, inside the window, on an accepted approval gig', () => {
  const e = escrow({ status: 'accepted', counterparty_id: WORKER, assignedSecondsAgo: 60 })
  assert.strictEqual(canUnassign(e, CREATOR, NOW), true)
  assert.strictEqual(canUnassign(e, WORKER, NOW), false)
})

test('canUnassign: refused once the window closes', () => {
  const e = escrow({
    status: 'accepted',
    counterparty_id: WORKER,
    assignedSecondsAgo: 3601,
    unassign_window_seconds: 3600,
  })
  assert.strictEqual(canUnassign(e, CREATOR, NOW), false)
})

test('canUnassign: refused on an instant-mode gig — that worker DID sign', () => {
  const e = escrow({ status: 'accepted', counterparty_id: WORKER, requires_approval: false })
  assert.strictEqual(canUnassign(e, CREATOR, NOW), false)
})

test('canUnassign: refused once work is submitted (status is past accepted)', () => {
  const e = escrow({ status: 'submitted', counterparty_id: WORKER })
  assert.strictEqual(canUnassign(e, CREATOR, NOW), false)
})

// ── canReleaseAssignment ────────────────────────────────────────────────────

const GRACE = 3600

test('canReleaseAssignment: the assigned worker, once, on an approval gig', () => {
  const e = escrow({ status: 'accepted', counterparty_id: WORKER })
  assert.strictEqual(canReleaseAssignment(e, WORKER, GRACE, NOW), true)
  assert.strictEqual(canReleaseAssignment(e, CREATOR, GRACE, NOW), false)
})

test('canReleaseAssignment: does not re-arm once stamped', () => {
  const e = escrow({
    status: 'accepted',
    counterparty_id: WORKER,
    assignment_released_at: inPast(60),
  })
  assert.strictEqual(canReleaseAssignment(e, WORKER, GRACE, NOW), false)
})

test('canReleaseAssignment: refused on an instant-mode gig they accepted themselves', () => {
  const e = escrow({ status: 'accepted', counterparty_id: WORKER, requires_approval: false })
  assert.strictEqual(canReleaseAssignment(e, WORKER, GRACE, NOW), false)
})

/**
 * The release suppresses the abandonment strike, so an UNBOUNDED one makes
 * ghosting strictly better than the honest early exit: run the delivery window
 * out, then step back for free just before the poster reclaims. The prompt has
 * always promised this bound; nothing enforced it.
 */
test('canReleaseAssignment: closes with the delivery window, grace included', () => {
  // Assigned long enough ago that completion_deadline is already behind us.
  const late = escrow({
    status: 'accepted',
    counterparty_id: WORKER,
    assignedSecondsAgo: DURATION_SECONDS + GRACE + 60,
  })
  assert.strictEqual(canReleaseAssignment(late, WORKER, GRACE, NOW), false)

  // Inside the grace period it is still open — the same instant `submit` is.
  const inGrace = escrow({
    status: 'accepted',
    counterparty_id: WORKER,
    assignedSecondsAgo: DURATION_SECONDS + 60,
  })
  assert.strictEqual(canReleaseAssignment(inGrace, WORKER, GRACE, NOW), true)
})

// ── the tight-window warning (critical assessment #3) ───────────────────────

test('acceptWindowState: closing only once the accept window is nearly out', () => {
  const tight = APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS - 60
  const roomy = APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS + 60
  assert.strictEqual(acceptWindowState({ accept_deadline: inFuture(tight) }, NOW), 'closing')
  assert.strictEqual(acceptWindowState({ accept_deadline: inFuture(roomy) }, NOW), 'open')
})

test('acceptWindowState: no deadline means nothing to run out', () => {
  assert.strictEqual(acceptWindowState({ accept_deadline: null }, NOW), 'open')
})

test('acceptWindowState: a passed deadline is CLOSED, not merely closing', () => {
  // The distinction the copy hangs on: with the deadline gone the poster
  // cannot assign anybody, so "hurry up" would be the wrong thing to tell
  // them. This is also the common case — the unassign window is measured from
  // the assignment, so a gig assigned near its deadline spends most of that
  // window here.
  assert.strictEqual(acceptWindowState({ accept_deadline: inPast(60) }, NOW), 'closed')
})

test('acceptWindowState: exactly ON the deadline agrees with canAssign', () => {
  // canAssign is `now <= deadline`, so the instant itself still counts as
  // room — the warning must not contradict a button that is still live.
  const onTheDot = new Date(NOW).toISOString()
  assert.strictEqual(acceptWindowState({ accept_deadline: onTheDot }, NOW), 'closing')
  assert.strictEqual(canAssign(escrow({ accept_deadline: onTheDot }), CREATOR, NOW), true)
})
