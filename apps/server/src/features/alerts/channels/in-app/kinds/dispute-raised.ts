/**
 * What the bell says when a dispute is raised.
 *
 * One file per kind, the same shape as ../../slack/kinds — a kind's Slack copy
 * and its in-app copy are siblings, and finding one should find the other.
 *
 * The audience is the SAME people as the Slack channel's, reached on a
 * different surface, so the facts match and only the framing differs: Slack is
 * a scannable line in a shared room, this is a row in one admin's own feed that
 * they tap to open the dispute.
 *
 * NO ESCAPING AND NO WHITESPACE COLLAPSE, unlike the Slack copy, and that is a
 * decision rather than an omission. Slack renders mrkdwn, so an unescaped `<`
 * there becomes markup and a newline forges a line in a structured message an
 * operator reads for attribution. A notification title and body are PLAIN TEXT
 * end to end — the row, the WS frame and the push payload all carry them
 * verbatim, and nothing renders them as markup — so escaping would show users
 * literal `&amp;` where they typed `&`. Collapsing whitespace would be cosmetic
 * only: this is one field with no structure to forge.
 *
 * That reasoning depends on the body staying plain text. A surface that ever
 * renders it as markdown or HTML changes the answer, and the escaping belongs
 * at that renderer rather than here, where it would corrupt every other reader.
 */

import type { EscrowKind } from '@tenda/shared'
import { disputePushData } from '@server/lib/notify'
import { alertPartyName } from '../../../identities'
import type { AlertPartyNames } from '../../../identities'
import type { AlertOf } from '../../../types'
import type { InAppNotice } from '../notice'

type DisputeRaised = AlertOf<'dispute.raised'>

const TITLE = 'New dispute to review'

/**
 * What to call the escrow when it has no title of its own — an exchange has no
 * `gig_details` row, so it never has one.
 *
 * A full `Record<EscrowKind, …>` rather than an interpolated `a ${kind}`, which
 * reads "a exchange". Deriving the article would mean encoding English rules
 * for a two-member enum; naming both phrases is shorter, correct, and makes a
 * new escrow kind a compile error here rather than a grammar bug in production.
 */
const UNTITLED_SUBJECT: Readonly<Record<EscrowKind, string>> = {
  gig: 'a gig',
  exchange: 'an exchange',
}

/** Ids this copy renders. Only the raiser is named in the body. */
export function disputeRaisedPartyIds(alert: DisputeRaised): readonly (string | null)[] {
  return [alert.raised_by_id]
}

/**
 * The escrow's parties, excluded from the mediator roster.
 *
 * An admin who is a party to the disputed escrow is CONFLICTED — `assertCanClaimDispute`
 * already refuses to let them claim it — and they have their own party notice
 * about the same event from the escrow fan-out. Paging them here would both
 * duplicate that and contradict the conflict rule the rest of the system
 * enforces. Nulls are passed through; `mediatorUserIds` filters them.
 */
export function disputeRaisedExcluded(alert: DisputeRaised): readonly (string | null)[] {
  return [alert.creator_id, alert.counterparty_id]
}

export function disputeRaisedNotice(
  alert: DisputeRaised,
  names: AlertPartyNames,
): InAppNotice {
  const raiser = alertPartyName(names, alert.raised_by_id)

  // Names the SUBJECT and the RAISER, because the bell is a list: a feed of
  // rows that all read "New dispute to review" is one an admin has to open
  // every entry of to triage. The title stays constant on purpose — it is the
  // notification's category, and the body is where the specifics go.
  //
  // Composed freely rather than clamped here: `persistNotification` slices to
  // the column caps, which is the same contract `newGigNotice` relies on. A cap
  // applied twice is a cap that can disagree with itself.
  //
  // That slice never actually fires, and the arithmetic is worth recording
  // because it is the reason no clamp is needed. Worst case is 201 (two 100-char
  // name fields plus a space, the PATCH /users/me bound) + 24 of fixed wording +
  // 200 (MAX_GIG_TITLE_LENGTH) = 425, against NOTIFICATION_BODY_MAX of 500. The
  // margin is 75 characters, so raising either input bound starts silently
  // truncating from the END — which would cut the SUBJECT, the part that tells
  // two rows apart. Unlike the Slack copy this deliberately does not cap the
  // name, because doing so would cost the margin nothing and gain nothing while
  // those bounds hold.
  // Blank counts as absent, the same rule the Slack copy applies: a row that
  // exists holding whitespace would otherwise render as an empty pair of quotes.
  const title = alert.escrow_title === null ? '' : alert.escrow_title.trim()
  const subject = title === '' ? UNTITLED_SUBJECT[alert.escrow_kind] : `"${title}"`

  return {
    title: TITLE,
    body: `${raiser} raised a dispute on ${subject}.`,
    // The SHARED dispute deep-link builder, not a hand-written bag: it carries
    // both ids because mobile routes by escrow and the dashboard keys by
    // dispute, and it already handles the null dispute_id case.
    data: disputePushData(alert.escrow_id, alert.dispute_id),
  }
}
