/**
 * THE arrangement table: every reachable (status × mode × viewer × timing),
 * and exactly which controls the bar puts on screen for it.
 *
 * This file exists because the bar's branches used to suppress each other, and
 * every one of the reported bugs was a button that should have been beside
 * another and wasn't. Asserting one branch at a time cannot catch that — only
 * asserting the WHOLE arrangement can.
 *
 * Two invariants ride along on every row, and they are what make adding a
 * branch safe rather than a gamble:
 *   - no conflicts: nothing was displaced into a slot that was already taken;
 *   - at most two secondary: no row is ever crowded.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { assignSlots, isEmptyArrangement } from '../../src/gig-cta/slots'
import { gigCtaBranches } from '../../src/gig-cta/branches'
import { MAX_SECONDARY } from '../../src/gig-cta/types'
import {
  CREATOR_ID,
  STRANGER_ID,
  WORKER_ID,
  application,
  assignedApprovalGig,
  gigDetail,
  review,
  userRef,
} from './fixtures'
import type { ApplicationStatus, GigDetail } from '../../src'

/**
 * The SAME clock the fixtures use.
 *
 * `assignedApprovalGig` derives its deadlines from `Date.now()`, so pinning
 * NOW to a fixed calendar date put two clocks in one assertion: with the
 * fixture's 1h unassign window, "the poster gets Release assignment" failed
 * whenever the suite ran earlier in the day than the pinned time. Every
 * deadline here is expressed as an offset, so a live clock is exactly as
 * deterministic and cannot drift from the fixtures.
 */
const NOW = new Date()
const GRACE = 3600
const HOUR = 3600_000

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

function viewerWith(status: ApplicationStatus) {
  return { application: application({ status }), open_application_count: null }
}

/** The arrangement as a comparable shape: slot → branch ids. */
function arrange(gig: GigDetail, userId: string) {
  const a = assignSlots(gigCtaBranches(gig, userId, GRACE, NOW))
  assert.deepStrictEqual(a.conflicts, [])
  assert.ok(a.secondary.length <= MAX_SECONDARY)
  return {
    notice: a.notice?.id ?? null,
    primary: a.primary?.id ?? null,
    secondary: a.secondary.map((b) => b.id),
  }
}

const EMPTY = { notice: null, primary: null, secondary: [] }

// ── draft ───────────────────────────────────────────────────────────────────

describe('draft', () => {
  it('offers the creator both moves, and nobody else anything', () => {
    const draft = gigDetail({ status: 'draft' })
    assert.deepStrictEqual(arrange(draft, CREATOR_ID), {
      notice: null,
      primary: 'retryDraft',
      secondary: ['deleteDraft'],
    })
    assert.deepStrictEqual(arrange(draft, STRANGER_ID), EMPTY)
  })
})

// ── open ────────────────────────────────────────────────────────────────────

describe('open', () => {
  it('gives an instant-mode poster Cancel, and an expired one Claim Refund instead', () => {
    assert.deepStrictEqual(arrange(gigDetail(), CREATOR_ID), {
      notice: null,
      primary: null,
      secondary: ['cancel'],
    })
    // Not both: past the deadline they are two buttons for one outcome and
    // `cancel` is the one the server refuses.
    assert.deepStrictEqual(arrange(gigDetail({ accept_deadline: iso(-HOUR) }), CREATOR_ID), {
      notice: null,
      primary: 'refundExpired',
      secondary: [],
    })
  })

  /** The reported bug: an approval-mode poster could not cancel their own gig. */
  it('gives an approval-mode poster BOTH View Applicants and Cancel', () => {
    assert.deepStrictEqual(arrange(gigDetail({ requires_approval: true }), CREATOR_ID), {
      notice: null,
      primary: 'assign',
      secondary: ['cancel'],
    })
  })

  it('drops assign past the accept deadline, leaving only the refund', () => {
    const expired = gigDetail({ requires_approval: true, accept_deadline: iso(-HOUR) })
    assert.deepStrictEqual(arrange(expired, CREATOR_ID), {
      notice: null,
      primary: 'refundExpired',
      secondary: [],
    })
  })

  it('offers a worker Accept on an instant gig and nothing on an approval one', () => {
    assert.deepStrictEqual(arrange(gigDetail(), STRANGER_ID), {
      notice: null,
      primary: 'accept',
      secondary: [],
    })
    assert.deepStrictEqual(arrange(gigDetail({ requires_approval: true }), STRANGER_ID), {
      notice: null,
      primary: 'apply',
      secondary: [],
    })
  })

  /** A real transition that had no button: the only way out was to ignore it. */
  it('gives an INVITED worker Decline beside Accept, and strangers neither', () => {
    const invited = gigDetail({ assigned_counterparty_id: WORKER_ID })
    assert.deepStrictEqual(arrange(invited, WORKER_ID), {
      notice: null,
      primary: 'accept',
      secondary: ['decline'],
    })
    assert.deepStrictEqual(arrange(invited, STRANGER_ID), EMPTY)
  })

  /**
   * The shape a stranger actually receives: /v1/gigs/:id withholds the
   * assignee's user id from anyone who is not a party, so the invite arrives
   * as `is_assigned: true` with no id. Judged on the id alone that reads as
   * "open to anyone" and hands them an Accept button the chain reverts — the
   * privacy fix reintroducing the mode-blindness bug this file guards.
   */
  it('keeps a stranger off an invited gig even when the assignee is withheld', () => {
    const withheld = gigDetail({ assigned_counterparty_id: null, is_assigned: true })
    assert.deepStrictEqual(arrange(withheld, STRANGER_ID), EMPTY)
  })

  it('offers Withdraw on a live application, Apply once it is settled', () => {
    const approval = (v: ApplicationStatus) =>
      gigDetail({ requires_approval: true, viewer: viewerWith(v) })
    assert.strictEqual(arrange(approval('open'), STRANGER_ID).primary, 'withdraw')
    for (const settled of ['withdrawn', 'expired', 'passed', 'released'] as const) {
      assert.strictEqual(arrange(approval(settled), STRANGER_ID).primary, 'apply')
    }
  })
})

// ── accepted ────────────────────────────────────────────────────────────────

describe('accepted', () => {
  /** Issue 1: Submit Proof was hidden behind "I'm not available". */
  it('gives an assigned worker BOTH Submit Proof and the release', () => {
    assert.deepStrictEqual(arrange(assignedApprovalGig(), WORKER_ID), {
      notice: null,
      primary: 'submit',
      secondary: ['release'],
    })
  })

  it('drops the release once stamped, keeping Submit Proof', () => {
    const released = assignedApprovalGig({}, { assignment_released_at: iso(-1000) })
    assert.deepStrictEqual(arrange(released, WORKER_ID), {
      notice: null,
      primary: 'submit',
      secondary: [],
    })
  })

  /**
   * The release suppresses the abandonment strike, so an unbounded one lets a
   * worker ghost the whole window and step back penalty-free at the end.
   */
  it('closes the release with the delivery window, leaving Dispute', () => {
    const late = assignedApprovalGig({ durationSeconds: 3600 }, {
      completion_deadline: iso(-2 * HOUR),
    })
    assert.deepStrictEqual(arrange(late, WORKER_ID), {
      notice: null,
      primary: null,
      secondary: ['dispute'],
    })
  })

  it('gives an instant-mode worker Submit Proof alone while deliverable', () => {
    const gig = gigDetail({
      status: 'accepted',
      counterparty: userRef(WORKER_ID),
      completion_deadline: iso(HOUR),
    })
    assert.deepStrictEqual(arrange(gig, WORKER_ID), {
      notice: null,
      primary: 'submit',
      secondary: [],
    })
  })

  it('gives the poster Dispute, and adds Release assignment inside the window', () => {
    const instant = gigDetail({
      status: 'accepted',
      counterparty: userRef(WORKER_ID),
      completion_deadline: iso(HOUR),
    })
    assert.deepStrictEqual(arrange(instant, CREATOR_ID), {
      notice: null,
      primary: null,
      secondary: ['dispute'],
    })
    assert.deepStrictEqual(arrange(assignedApprovalGig(), CREATOR_ID), {
      notice: null,
      primary: 'unassign',
      secondary: ['dispute'],
    })
  })

  it('swaps Dispute-only for Reclaim once the window closes — not a grace early', () => {
    const inGrace = gigDetail({
      status: 'accepted',
      counterparty: userRef(WORKER_ID),
      completion_deadline: iso(-HOUR / 2),
    })
    // Deadline passed but still inside grace: the server would refuse Reclaim.
    // Asserted on the WHOLE arrangement — `reclaim` is a secondary now, so
    // checking `primary` alone would no longer prove it is absent.
    assert.deepStrictEqual(arrange(inGrace, CREATOR_ID), {
      notice: null,
      primary: null,
      secondary: ['dispute'],
    })
    const past = gigDetail({
      status: 'accepted',
      counterparty: userRef(WORKER_ID),
      completion_deadline: iso(-2 * HOUR),
    })
    assert.deepStrictEqual(arrange(past, CREATOR_ID), {
      notice: null,
      primary: null,
      secondary: ['reclaim', 'dispute'],
    })
  })

  /**
   * Both windows open at once, which is reachable on DEFAULT config: the
   * unassign window runs 6h from the assignment while a poster may set a
   * delivery window as short as MIN_COMPLETION_DURATION_SECONDS (1h). Two
   * branches wanting `primary` would have dropped one of them silently — the
   * exact failure the slots exist to catch.
   */
  it('shows all three when the unassign and delivery windows overlap', () => {
    // Deadlines pinned to NOW rather than built by the fixture, which works
    // from the real clock: assigned 3h ago on a 1h gig (delivery window and
    // its grace both long gone) with a 6h release window still running.
    const shortGig = gigDetail({
      status: 'accepted',
      requires_approval: true,
      counterparty: userRef(WORKER_ID),
      completion_duration_seconds: 3600,
      completion_deadline: iso(-2 * HOUR),
      unassign_window_seconds: 6 * 3600,
    })
    assert.deepStrictEqual(arrange(shortGig, CREATOR_ID), {
      notice: null,
      primary: 'unassign',
      secondary: ['reclaim', 'dispute'],
    })
  })

  it('says so plainly to an applicant who lost', () => {
    const gig = assignedApprovalGig({}, { viewer: viewerWith('passed') })
    assert.deepStrictEqual(arrange(gig, STRANGER_ID), {
      notice: 'lost',
      primary: null,
      secondary: [],
    })
  })

  /**
   * The winner's own row is `assigned`, and an earlier draft of the fallback
   * caught it — showing "You got this gig" to someone halfway through
   * delivering it, in place of their actual buttons.
   */
  it('gives the WINNER their buttons, never an application status line', () => {
    const winner = assignedApprovalGig({}, { viewer: viewerWith('assigned') })
    assert.deepStrictEqual(arrange(winner, WORKER_ID), {
      notice: null,
      primary: 'submit',
      secondary: ['release'],
    })
  })

  /** `lost` reads `counterparty?.id`, which is null on a reopened gig. */
  it('still says so when the gig has been reopened and has no worker', () => {
    const reopened = gigDetail({ requires_approval: true, viewer: viewerWith('released') })
    assert.strictEqual(arrange(reopened, WORKER_ID).primary, 'apply')
  })
})

// ── submitted ───────────────────────────────────────────────────────────────

describe('submitted', () => {
  const submitted = (overrides: Partial<GigDetail> = {}) =>
    gigDetail({ status: 'submitted', counterparty: userRef(WORKER_ID), ...overrides })

  it('gives the poster Approve & Pay with Dispute beneath it', () => {
    assert.deepStrictEqual(arrange(submitted(), CREATOR_ID), {
      notice: null,
      primary: 'approve',
      secondary: ['dispute'],
    })
  })

  it('gives the worker Add Proof and Dispute while the poster reviews', () => {
    assert.deepStrictEqual(arrange(submitted({ approval_deadline: iso(HOUR) }), WORKER_ID), {
      notice: null,
      primary: null,
      secondary: ['addProof', 'dispute'],
    })
  })

  /** Dispute used to vanish here the moment Claim Payment appeared. */
  it('keeps Dispute when the approval window passes and Claim appears', () => {
    assert.deepStrictEqual(arrange(submitted({ approval_deadline: iso(-HOUR) }), WORKER_ID), {
      notice: null,
      primary: 'claimStalled',
      secondary: ['addProof', 'dispute'],
    })
  })
})

// ── disputed and terminal ───────────────────────────────────────────────────

describe('disputed and terminal states', () => {
  const disputed = gigDetail({ status: 'disputed', counterparty: userRef(WORKER_ID) })

  it('lets the worker keep adding evidence, and offers neither party a Dispute', () => {
    assert.deepStrictEqual(arrange(disputed, WORKER_ID), {
      notice: 'disputedNotice',
      primary: null,
      secondary: ['addEvidence'],
    })
    assert.deepStrictEqual(arrange(disputed, CREATOR_ID), {
      notice: 'disputedNotice',
      primary: null,
      secondary: [],
    })
    // A stranger sees the notice too, and has since before this change: the
    // gig detail is a public route and the status badge already says disputed.
    // Pinned rather than left incidental.
    assert.deepStrictEqual(arrange(disputed, STRANGER_ID), {
      notice: 'disputedNotice',
      primary: null,
      secondary: [],
    })
  })

  it('offers a review once, to each party, on completed and resolved', () => {
    for (const status of ['completed', 'resolved'] as const) {
      const gig = gigDetail({ status, counterparty: userRef(WORKER_ID) })
      assert.strictEqual(arrange(gig, CREATOR_ID).primary, 'review')
      assert.strictEqual(arrange(gig, WORKER_ID).primary, 'review')
      assert.deepStrictEqual(arrange(gig, STRANGER_ID), EMPTY)
    }
  })

  it('withdraws the review once that party has left one, but not for the other', () => {
    const reviewed = gigDetail({
      status: 'completed',
      counterparty: userRef(WORKER_ID),
      reviews: [review(CREATOR_ID)],
    })
    assert.deepStrictEqual(arrange(reviewed, CREATOR_ID), EMPTY)
    assert.strictEqual(arrange(reviewed, WORKER_ID).primary, 'review')
  })

  it('shows nothing at all once cancelled or refunded', () => {
    for (const status of ['cancelled', 'refunded'] as const) {
      const gig = gigDetail({ status, counterparty: userRef(WORKER_ID) })
      for (const viewer of [CREATOR_ID, WORKER_ID, STRANGER_ID]) {
        assert.deepStrictEqual(arrange(gig, viewer), EMPTY)
        assert.strictEqual(isEmptyArrangement(assignSlots(gigCtaBranches(gig, viewer, GRACE, NOW))), true)
      }
    }
  })
})

// ── taken down (CO1) ────────────────────────────────────────────────────────
//
// A hidden gig is still readable by its PARTIES — the detail route serves it to
// them precisely because the escrow stays operable — so the bar keeps working;
// it just stops offering the ways IN. These rows are the whole-arrangement
// proof of that, which is the only way to catch a takedown that took an EXIT
// with it. Decline is the one that nearly did: it used to be nested inside the
// `canAccept` branch.

describe('taken down', () => {
  const down = (over: Partial<GigDetail> = {}) => gigDetail({ hidden: true, ...over })

  it('offers a would-be worker nothing at all', () => {
    // Same gig, one flag apart — so this cannot pass by the viewer being wrong.
    assert.deepStrictEqual(arrange(gigDetail(), STRANGER_ID), {
      notice: null,
      primary: 'accept',
      secondary: [],
    })
    assert.deepStrictEqual(arrange(down(), STRANGER_ID), EMPTY)
  })

  it('leaves an INVITED worker Decline, having taken Accept', () => {
    // The regression this guards: gating `canAccept` used to remove the whole
    // branch, and Decline lived inside it. Being pulled out from under someone
    // is not a reason to trap them in the invitation.
    const invited = down({ assigned_counterparty_id: WORKER_ID })
    assert.deepStrictEqual(arrange(invited, WORKER_ID), {
      notice: null,
      primary: null,
      secondary: ['decline'],
    })
  })

  it('keeps the poster their way out — Cancel, or Claim Refund once expired', () => {
    assert.deepStrictEqual(arrange(down(), CREATOR_ID), {
      notice: null,
      primary: null,
      secondary: ['cancel'],
    })
    assert.deepStrictEqual(arrange(down({ accept_deadline: iso(-HOUR) }), CREATOR_ID), {
      notice: null,
      primary: 'refundExpired',
      secondary: [],
    })
  })

  it('takes Apply from the worker and Assign from the poster in approval mode', () => {
    const approval = down({ requires_approval: true })
    assert.deepStrictEqual(arrange(approval, STRANGER_ID), EMPTY)
    // The poster loses the primary but keeps Cancel — they still own the money.
    assert.deepStrictEqual(arrange(approval, CREATOR_ID), {
      notice: null,
      primary: null,
      secondary: ['cancel'],
    })
  })

  it('lets an applicant still withdraw', () => {
    // Their application is live on a gig that has been pulled; the server keeps
    // the withdraw route open for exactly this, so the button must stay too.
    const applied = down({ requires_approval: true, viewer: viewerWith('open') })
    assert.deepStrictEqual(arrange(applied, WORKER_ID), {
      notice: null,
      primary: 'withdraw',
      secondary: [],
    })
  })

  it('changes NOTHING once work is under way', () => {
    // Past `open` there is no way in left to block, so a takedown must be
    // completely invisible to the bar. Asserted against the visible gig rather
    // than a literal, so it stays true as those states evolve.
    const states: Partial<GigDetail>[] = [
      { status: 'accepted', counterparty: userRef(WORKER_ID) },
      { status: 'submitted', counterparty: userRef(WORKER_ID), approval_deadline: iso(-HOUR) },
      { status: 'disputed', counterparty: userRef(WORKER_ID) },
      { status: 'completed', counterparty: userRef(WORKER_ID) },
    ]
    for (const state of states) {
      for (const viewer of [CREATOR_ID, WORKER_ID, STRANGER_ID]) {
        assert.deepStrictEqual(arrange(down(state), viewer), arrange(gigDetail(state), viewer))
      }
    }
  })

  it('still lets the worker submit and the poster approve', () => {
    // The equality above would be satisfied by two empty bars; these pin the
    // actual buttons, because this is where money is at stake.
    const accepted = down({ status: 'accepted', counterparty: userRef(WORKER_ID) })
    assert.strictEqual(arrange(accepted, WORKER_ID).primary, 'submit')
    const submitted = down({ status: 'submitted', counterparty: userRef(WORKER_ID) })
    assert.strictEqual(arrange(submitted, CREATOR_ID).primary, 'approve')
  })

  it('leaves a draft ENTIRELY alone — repost included, deliberately', () => {
    // A DECISION, written down as the whole arrangement rather than as the one
    // half that felt safe. Asserting only `.secondary` here (the first version
    // of this test) passed identically whether the takedown was honoured or
    // ignored, which made it look like a guard while guarding nothing.
    //
    // Why repost survives: it is not a way into THIS escrow. `build-create` on
    // the hidden draft is refused server-side, and tapping repost opens a fresh
    // create — new escrow, re-screened by the Stage-6 moderation gate, old
    // draft deleted. Blocking it would prevent nothing either (the same text
    // can be retyped from "Post a gig" in a minute) while reading to a
    // moderator as enforcement that is not there. A takedown removes a listing;
    // suspending an account is the tool for a person.
    const draft = down({ status: 'draft' })
    assert.deepStrictEqual(arrange(draft, CREATOR_ID), {
      notice: null,
      primary: 'retryDraft',
      secondary: ['deleteDraft'],
    })
    // Stated as an equality with the visible draft too, so this reads as "the
    // takedown changes nothing here" rather than as a list someone must keep
    // in step with the draft branch.
    assert.deepStrictEqual(arrange(draft, CREATOR_ID), arrange(gigDetail({ status: 'draft' }), CREATOR_ID))
  })
})
