import type { EscrowTxType } from './escrow'

export const REPORT_CONTENT_TYPES = ['escrow', 'message', 'user', 'review'] as const
export const REPORT_REASONS       = ['spam', 'harassment', 'inappropriate', 'fraud', 'other'] as const
export const REPORT_STATUSES      = ['pending', 'reviewed', 'actioned', 'dismissed'] as const

export type ReportContentType = (typeof REPORT_CONTENT_TYPES)[number]
export type ReportReason      = (typeof REPORT_REASONS)[number]
export type ReportStatus      = (typeof REPORT_STATUSES)[number]

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam:          'Spam',
  harassment:    'Harassment',
  inappropriate: 'Inappropriate content',
  fraud:         'Fraud or scam',
  other:         'Other',
}

// ── CO1 takedown (`escrows.hidden`) ────────────────────────────────────

/**
 * Everything a user can ask of an escrow: the on-chain transaction types plus
 * `apply`, which is the one entry action with no transaction behind it.
 */
export type TakedownAction = EscrowTxType | 'apply'

/**
 * What a takedown does to each action.
 *
 * `blocked` is exactly the set that would put a NEW PARTICIPANT — or new money
 * — into a listing moderation has pulled. Everything else is `allowed`, and
 * that is the load-bearing half: a taken-down escrow may hold funds locked
 * on-chain, so its parties must keep every way OUT. Blocking `submit` or
 * `approve` would strand real money, which is why this is an exhaustive table
 * rather than a list of the four names that matter — `satisfies` makes a newly
 * added `EscrowTxType` a compile error here until someone decides which half it
 * belongs to.
 *
 * The server enforces it (lib/escrow/takedown.ts, and it is authoritative
 * against a stale client); the client reads it to stop offering the button.
 */
const TAKEDOWN_POLICY = {
  // Ways IN.
  create:            'blocked',
  accept:            'blocked',
  assign_accept:     'blocked',
  apply:             'blocked',
  // Ways OUT — never blocked, whatever moderation decided about the listing.
  decline:           'allowed',
  unassign:          'allowed',
  submit:            'allowed',
  approve:           'allowed',
  claim_stalled:     'allowed',
  cancel:            'allowed',
  refund_expired:    'allowed',
  reclaim_abandoned: 'allowed',
  dispute:           'allowed',
  resolve:           'allowed',
} as const satisfies Record<TakedownAction, 'blocked' | 'allowed'>

export function isBlockedByTakedown(action: TakedownAction): boolean {
  return TAKEDOWN_POLICY[action] === 'blocked'
}

/**
 * What the server says when it refuses one. Says WHY without naming the
 * moderation decision — the reason is between the reporter and the admin, and
 * the caller is often a stranger whose screen simply went stale.
 */
export const TAKEDOWN_REFUSED_MESSAGE =
  'This listing has been removed and is no longer open to new participants.'
