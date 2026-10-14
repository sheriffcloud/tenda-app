/**
 * Approval-mode copy.
 *
 * Tested because it is load-bearing rather than decorative: D2 holds an
 * applicant accountable for a gig they are assigned to, and D5 leaves
 * availability to them — so the obligation notice is the only place that
 * bargain is stated, and a status line is the only explanation a losing
 * applicant ever gets.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  APPLICATION_STATUSES,
  APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS,
} from '../../src/constants/applications'
import {
  APPLY_OBLIGATION,
  applicantStatusLine,
  applicantsCtaLabel,
  applicationStatusLine,
  openApplicationLine,
  UNASSIGN_WINDOW_INFORMATION,
} from '../../src/constants/gig-applications-copy'

describe('APPLY_OBLIGATION', () => {
  it('states both halves of the bargain: they can be picked, and withdrawing is how to opt out', () => {
    assert.match(APPLY_OBLIGATION, /pick you at any time/i)
    assert.match(APPLY_OBLIGATION, /withdraw/i)
    // The consequence has to be named, or the strike rule is a trap.
    assert.match(APPLY_OBLIGATION, /standing/i)
  })
})

describe('applicantsCtaLabel', () => {
  it('shows the count when there is one', () => {
    assert.strictEqual(applicantsCtaLabel(3), 'View applicants (3)')
  })

  it('drops the number at zero and when it is withheld', () => {
    // "(0)" reads as a confident empty state on a screen the poster has not
    // opened; null means the server did not tell us, which is not zero.
    assert.strictEqual(applicantsCtaLabel(0), 'View applicants')
    assert.strictEqual(applicantsCtaLabel(null), 'View applicants')
  })
})

describe('applicationStatusLine', () => {
  it('covers every shared application status', () => {
    for (const status of APPLICATION_STATUSES) {
      assert.notStrictEqual(applicationStatusLine(status, null), '')
    }
  })

  it('quotes the time left on a live application', () => {
    assert.match(applicationStatusLine('open', 7200), /expires in 2h/i)
  })

  it('omits the countdown when there is no time left to quote', () => {
    assert.strictEqual(applicationStatusLine('open', null), 'Waiting on the poster')
    assert.strictEqual(applicationStatusLine('open', 0), 'Waiting on the poster')
  })

  it('says who won in plain words, never a status enum', () => {
    assert.match(applicationStatusLine('passed', null), /someone else/i)
    assert.match(applicationStatusLine('assigned', null), /you got/i)
    assert.match(applicationStatusLine('expired', null), /expired/i)
    assert.match(applicationStatusLine('withdrawn', null), /withdrew/i)
  })

  /**
   * The bug: after the poster released them, the worker's row still said
   * `assigned`, so the gig detail greeted them with "You got this gig — it's
   * yours to deliver" above an Apply button.
   */
  it('tells a released worker what actually happened, not that the gig is theirs', () => {
    assert.match(applicationStatusLine('released', null), /released your assignment/i)
    assert.doesNotMatch(applicationStatusLine('released', null), /you got this gig/i)
  })

  // An unknown status is no longer representable: both functions take
  // `ApplicationStatus` and switch exhaustively, so a new status is a compile
  // error rather than a silently blank line. That is the guarantee the old
  // `default: return ''` gave away.
})

describe('applicantStatusLine (the poster reads this one)', () => {
  it('covers every shared application status', () => {
    for (const status of APPLICATION_STATUSES) {
      assert.notStrictEqual(applicantStatusLine(status), '')
    }
  })

  it('never addresses the poster in the applicant\'s voice', () => {
    // "You withdrew this application" shown to the poster is simply false, and
    // "The poster picked someone else" is nonsense said to the poster who
    // picked. Every line must differ from the applicant-facing one.
    for (const status of APPLICATION_STATUSES) {
      assert.notStrictEqual(applicantStatusLine(status), applicationStatusLine(status, null))
    }
    assert.strictEqual(applicantStatusLine('withdrawn'), 'They withdrew')
    assert.strictEqual(applicantStatusLine('passed'), 'Not selected')
    assert.strictEqual(applicantStatusLine('open'), 'Waiting on you')
  })

  it('frames a release as the poster\'s own act, since it was', () => {
    assert.match(applicantStatusLine('released'), /you released/i)
  })
})

describe('openApplicationLine', () => {
  const inFuture = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const inPast = new Date(Date.now() - 60_000).toISOString()

  it('waits on the poster while the gig is open and can still be assigned', () => {
    assert.strictEqual(openApplicationLine({ status: 'open', accept_deadline: inFuture }), 
      applicationStatusLine('open', null),
    )
    // No deadline at all is indefinitely open, not closed.
    assert.strictEqual(openApplicationLine({ status: 'open', accept_deadline: null }), 
      applicationStatusLine('open', null),
    )
  })

  it('stops claiming a decision is pending once the gig is over', () => {
    // Cancelling settles no applications — only an assignment does (D4) — so
    // an open row outlives the gig until the expiry sweep catches it.
    for (const status of ['cancelled', 'refunded', 'accepted', 'completed'] as const) {
      assert.match(openApplicationLine({ status, accept_deadline: inFuture }), /no longer taking workers/i)
    }
  })

  it('treats an expired-but-open gig as closed, because it is', () => {
    // Past the accept deadline the poster cannot assign anybody — the gig is
    // on the refund path — so "waiting on the poster" is as false here as it
    // is on a cancelled one.
    assert.match(openApplicationLine({ status: 'open', accept_deadline: inPast }), /no longer taking workers/i)
  })

  it('still points at withdrawing, because the slot is the reason to', () => {
    // An open row occupies one of `max_open_applications` until it expires.
    assert.match(openApplicationLine({ status: 'cancelled', accept_deadline: null }), /withdraw/i)
  })
})

describe('the unassign warnings', () => {
  it('threshold is a day, matching the shortest accept window a poster can pick', () => {
    assert.strictEqual(APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS, 24 * 60 * 60)
  })

  it('says "soon" only while there is still time', () => {
    assert.match(UNASSIGN_WINDOW_INFORMATION.closing.description, /closes to new workers soon/i)
    // Past the deadline nobody can be assigned, so urgency is the wrong note:
    // the poster is choosing between this worker and a refund.
    assert.match(UNASSIGN_WINDOW_INFORMATION.closed.description, /already closed/i)
    assert.doesNotMatch(UNASSIGN_WINDOW_INFORMATION.closed.description, /soon/i)
  })

  it('names the consequence in both, since that is what the poster is deciding on', () => {
    for (const information of Object.values(UNASSIGN_WINDOW_INFORMATION)) {
      assert.match(information.description, /refund/i)
      assert.match(information.description, /repost|post the gig again/i)
      assert.ok(information.summary.length < information.description.length)
    }
  })
})
