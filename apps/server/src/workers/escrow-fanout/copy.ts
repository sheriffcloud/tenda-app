/**
 * The push copy matrix, split out so the wording can be unit-tested without a
 * DB or a queue (test/unit/escrow-fanout.test.ts pins it).
 *
 * Copy is KIND-AWARE: gigs and P2P exchanges share the same escrow primitive
 * but read very differently to the user ("worker accepted your gig" vs "buyer
 * accepted your offer"), so every notice carries both wordings and the fan-out
 * picks by escrows.kind.
 */

import type { InternalEscrowEvent } from '@server/lib/escrow-events'
import type { EscrowKind } from '@tenda/shared'

export interface NoticeCopy {
  title: string
  body: string
}

export interface EventNotice {
  /** Which party learns about it — the one who didn't act. */
  recipient: 'creator' | 'counterparty' | 'both'
  gig: NoticeCopy
  exchange: NoticeCopy
}

/**
 * High-signal events only: lifecycle steps the OTHER party must react to.
 * Expiry notices ride the expire-escrows job; created/cancelled are the
 * actor's own doing. Exchange copy frames the same transition from the P2P
 * seller/buyer perspective.
 */
const NOTICE_BY_EVENT: Partial<Record<InternalEscrowEvent, EventNotice>> = {
  'escrow.accepted': {
    recipient: 'creator',
    gig: { title: 'Gig accepted', body: 'A worker accepted your gig, work is underway.' },
    exchange: { title: 'Offer accepted', body: 'A buyer accepted your offer. Waiting for their payment.' },
  },
  // Approval mode: the worker signs NOTHING to be assigned, so this push is
  // the only moment they can learn the gig is theirs. Without it the mode is
  // unusable — they would have to happen to reopen the app.
  'escrow.counterparty_assigned': {
    recipient: 'counterparty',
    gig: { title: 'You got the gig', body: 'The poster assigned you. Open it to see what to deliver and by when.' },
    exchange: { title: 'You were matched', body: 'The seller matched you to their offer. Open it to continue.' },
  },
  // Symmetrically: they were placed without acting, so they must be told when
  // that is undone — otherwise they keep working on a gig they no longer hold.
  'escrow.assignment_released': {
    recipient: 'counterparty',
    gig: { title: 'Assignment withdrawn', body: 'The poster released your assignment. The gig is open to others again.' },
    exchange: { title: 'Match withdrawn', body: 'The seller released your match. The offer is open to others again.' },
  },
  'escrow.declined': {
    recipient: 'creator',
    gig: { title: 'Assignment declined', body: 'Your assigned worker declined. The gig is now open to everyone.' },
    exchange: { title: 'Offer declined', body: 'The assigned buyer declined. Your offer is open to everyone again.' },
  },
  'escrow.proof_submitted': {
    recipient: 'creator',
    gig: { title: 'Work submitted', body: 'Proof of completion is in, review and approve to release payment.' },
    exchange: { title: 'Payment marked as sent', body: 'The buyer marked the payment as sent. Confirm receipt to release the crypto.' },
  },
  'escrow.approved': {
    recipient: 'counterparty',
    gig: { title: 'Payment released', body: 'The poster approved your work. Funds are in your wallet.' },
    exchange: { title: 'Crypto released', body: 'The seller confirmed your payment. The crypto is in your wallet.' },
  },
  'escrow.payment_claimed': {
    recipient: 'creator',
    gig: { title: 'Payment auto-claimed', body: 'The approval window passed, so the worker claimed payment.' },
    exchange: { title: 'Crypto auto-claimed', body: 'The confirmation window passed, so the buyer claimed the crypto.' },
  },
  'escrow.abandoned': {
    recipient: 'counterparty',
    gig: { title: 'Escrow reclaimed', body: 'The poster reclaimed the escrow after the completion window passed.' },
    exchange: { title: 'Offer reclaimed', body: 'The payment window passed, so the seller reclaimed their crypto.' },
  },
  'escrow.dispute_raised': {
    recipient: 'both',
    gig: { title: 'Dispute opened', body: 'A dispute was raised on your escrow. Our team will review it.' },
    exchange: { title: 'Dispute opened', body: 'A dispute was raised on your trade. Our team will review it.' },
  },
  'escrow.dispute_resolved': {
    recipient: 'both',
    gig: { title: 'Dispute resolved', body: 'Your dispute has been resolved, check the escrow for the outcome.' },
    exchange: { title: 'Dispute resolved', body: 'Your dispute has been resolved, check the trade for the outcome.' },
  },
}

/** A notice flattened to the wording one escrow's parties actually receive. */
export type ResolvedNotice = NoticeCopy & { recipient: EventNotice['recipient'] }

/**
 * The notice for an event, or null when it deliberately notifies nobody.
 *
 * Kind-agnostic on purpose: the fan-out asks this BEFORE reading the escrow,
 * so an event with no party copy costs no query, and the kind-aware half runs
 * once the row is in hand. Splitting the two is what keeps the caller from
 * consulting this table twice and then null-checking a value it has already
 * proved present.
 */
export function partyNoticeFor(event: InternalEscrowEvent): EventNotice | null {
  return NOTICE_BY_EVENT[event] ?? null
}

/** Pick the wording for a kind — gigs and exchanges read differently. */
export function noticeCopyFor(notice: EventNotice, kind: EscrowKind): ResolvedNotice {
  const copy = kind === 'exchange' ? notice.exchange : notice.gig
  return { recipient: notice.recipient, ...copy }
}

/** Exported for direct unit testing of the copy matrix. */
export function escrowNoticeFor(
  event: InternalEscrowEvent,
  kind: EscrowKind,
): ResolvedNotice | null {
  const notice = partyNoticeFor(event)
  return notice === null ? null : noticeCopyFor(notice, kind)
}

/**
 * What a subscriber is told when a gig matching their saved city/category
 * goes live. Parameterised rather than a constant — it is still copy, and
 * "Remote" is the wording choice for a gig with no city, not a data default.
 */
export function newGigNotice(title: string, city: string | null): NoticeCopy {
  return { title: 'New Gig Posted', body: `"${title}" in ${city ?? 'Remote'}` }
}

/**
 * What an applicant is told when a transition settles or revives their
 * application without them doing anything. Both are the ONLY signal they get —
 * their row simply changes status — so neither can be dropped.
 */
export const APPLICANT_NOTICE: Record<'passed' | 'revived', NoticeCopy> = {
  passed: {
    title: 'Gig assigned to someone else',
    body: 'A gig you applied for went to another worker. Your application is closed.',
  },
  revived: {
    title: "You're back in the running",
    body: 'The worker on a gig you applied for fell through, so your application is live again.',
  },
}
