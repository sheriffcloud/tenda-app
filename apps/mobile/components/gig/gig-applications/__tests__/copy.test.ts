/**
 * Approval-mode copy.
 *
 * Tested because it is load-bearing rather than decorative: D2 holds an
 * applicant accountable for a gig they are assigned to, and D5 leaves
 * availability to them — so the obligation notice is the only place that
 * bargain is stated, and a status line is the only explanation a losing
 * applicant ever gets.
 */
import {
  APPLICATION_STATUSES,
  APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS,
} from '@tenda/shared'
import {
  APPLY_OBLIGATION,
  applicantStatusLine,
  applicantsCtaLabel,
  applicationStatusLine,
  openApplicationLine,
  UNASSIGN_WINDOW_INFORMATION,
} from '../copy'

describe('APPLY_OBLIGATION', () => {
  it('states both halves of the bargain: they can be picked, and withdrawing is how to opt out', () => {
    expect(APPLY_OBLIGATION).toMatch(/pick you at any time/i)
    expect(APPLY_OBLIGATION).toMatch(/withdraw/i)
    // The consequence has to be named, or the strike rule is a trap.
    expect(APPLY_OBLIGATION).toMatch(/standing/i)
  })
})

describe('applicantsCtaLabel', () => {
  it('shows the count when there is one', () => {
    expect(applicantsCtaLabel(3)).toBe('View applicants (3)')
  })

  it('drops the number at zero and when it is withheld', () => {
    // "(0)" reads as a confident empty state on a screen the poster has not
    // opened; null means the server did not tell us, which is not zero.
    expect(applicantsCtaLabel(0)).toBe('View applicants')
    expect(applicantsCtaLabel(null)).toBe('View applicants')
  })
})

describe('applicationStatusLine', () => {
  it('covers every shared application status', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(applicationStatusLine(status, null)).not.toBe('')
    }
  })

  it('quotes the time left on a live application', () => {
    expect(applicationStatusLine('open', 7200)).toMatch(/expires in 2h/i)
  })

  it('omits the countdown when there is no time left to quote', () => {
    expect(applicationStatusLine('open', null)).toBe('Waiting on the poster')
    expect(applicationStatusLine('open', 0)).toBe('Waiting on the poster')
  })

  it('says who won in plain words, never a status enum', () => {
    expect(applicationStatusLine('passed', null)).toMatch(/someone else/i)
    expect(applicationStatusLine('assigned', null)).toMatch(/you got/i)
    expect(applicationStatusLine('expired', null)).toMatch(/expired/i)
    expect(applicationStatusLine('withdrawn', null)).toMatch(/withdrew/i)
  })

  /**
   * The bug: after the poster released them, the worker's row still said
   * `assigned`, so the gig detail greeted them with "You got this gig — it's
   * yours to deliver" above an Apply button.
   */
  it('tells a released worker what actually happened, not that the gig is theirs', () => {
    expect(applicationStatusLine('released', null)).toMatch(/released your assignment/i)
    expect(applicationStatusLine('released', null)).not.toMatch(/you got this gig/i)
  })

  // An unknown status is no longer representable: both functions take
  // `ApplicationStatus` and switch exhaustively, so a new status is a compile
  // error rather than a silently blank line. That is the guarantee the old
  // `default: return ''` gave away.
})

describe('applicantStatusLine (the poster reads this one)', () => {
  it('covers every shared application status', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(applicantStatusLine(status)).not.toBe('')
    }
  })

  it('never addresses the poster in the applicant\'s voice', () => {
    // "You withdrew this application" shown to the poster is simply false, and
    // "The poster picked someone else" is nonsense said to the poster who
    // picked. Every line must differ from the applicant-facing one.
    for (const status of APPLICATION_STATUSES) {
      expect(applicantStatusLine(status)).not.toBe(applicationStatusLine(status, null))
    }
    expect(applicantStatusLine('withdrawn')).toBe('They withdrew')
    expect(applicantStatusLine('passed')).toBe('Not selected')
    expect(applicantStatusLine('open')).toBe('Waiting on you')
  })

  it('frames a release as the poster\'s own act, since it was', () => {
    expect(applicantStatusLine('released')).toMatch(/you released/i)
  })
})

describe('openApplicationLine', () => {
  const inFuture = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const inPast = new Date(Date.now() - 60_000).toISOString()

  it('waits on the poster while the gig is open and can still be assigned', () => {
    expect(openApplicationLine({ status: 'open', accept_deadline: inFuture })).toBe(
      applicationStatusLine('open', null),
    )
    // No deadline at all is indefinitely open, not closed.
    expect(openApplicationLine({ status: 'open', accept_deadline: null })).toBe(
      applicationStatusLine('open', null),
    )
  })

  it('stops claiming a decision is pending once the gig is over', () => {
    // Cancelling settles no applications — only an assignment does (D4) — so
    // an open row outlives the gig until the expiry sweep catches it.
    for (const status of ['cancelled', 'refunded', 'accepted', 'completed'] as const) {
      expect(openApplicationLine({ status, accept_deadline: inFuture })).toMatch(
        /no longer taking workers/i,
      )
    }
  })

  it('treats an expired-but-open gig as closed, because it is', () => {
    // Past the accept deadline the poster cannot assign anybody — the gig is
    // on the refund path — so "waiting on the poster" is as false here as it
    // is on a cancelled one.
    expect(openApplicationLine({ status: 'open', accept_deadline: inPast })).toMatch(
      /no longer taking workers/i,
    )
  })

  it('still points at withdrawing, because the slot is the reason to', () => {
    // An open row occupies one of `max_open_applications` until it expires.
    expect(openApplicationLine({ status: 'cancelled', accept_deadline: null })).toMatch(
      /withdraw/i,
    )
  })
})

describe('the unassign warnings', () => {
  it('threshold is a day, matching the shortest accept window a poster can pick', () => {
    expect(APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS).toBe(24 * 60 * 60)
  })

  it('says "soon" only while there is still time', () => {
    expect(UNASSIGN_WINDOW_INFORMATION.closing.description).toMatch(/closes to new workers soon/i)
    // Past the deadline nobody can be assigned, so urgency is the wrong note:
    // the poster is choosing between this worker and a refund.
    expect(UNASSIGN_WINDOW_INFORMATION.closed.description).toMatch(/already closed/i)
    expect(UNASSIGN_WINDOW_INFORMATION.closed.description).not.toMatch(/soon/i)
  })

  it('names the consequence in both, since that is what the poster is deciding on', () => {
    for (const information of Object.values(UNASSIGN_WINDOW_INFORMATION)) {
      expect(information.description).toMatch(/refund/i)
      expect(information.description).toMatch(/repost|post the gig again/i)
      expect(information.summary.length).toBeLessThan(information.description.length)
    }
  })
})
