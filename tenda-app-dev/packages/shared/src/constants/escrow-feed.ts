/**
 * Which `escrow_transactions` rows belong in a USER's personal transaction
 * feed (the wallet screen), as opposed to the escrow's full audit trail
 * (`GET /v1/escrows/:id/transactions`, which stays complete for every party).
 *
 * The feed used to be "every row on every escrow you are a party to", so a
 * poster's wallet read "Gig accepted" and "Proof submitted" for the WORKER's
 * actions. The rule here is: a row belongs to you if YOU acted, or if it
 * moved value to/from you.
 *
 * Keyed by (tx type × your role on the escrow) — deliberately NOT by
 * `escrow_transactions.actor_id`, which cannot carry this:
 *   - `resolve` has no actor at all (DisputeResolved is admin-initiated, so
 *     `EVENT_APPLICATIONS.DisputeResolved` declares no `actor_field`) — an
 *     actor filter would delete the dispute payout, the single most important
 *     row in the feed;
 *   - the EVM `ProofSubmitted` event carries no acting wallet while the Anchor
 *     one does (a real cross-chain asymmetry, see chains/evm/verify.ts), so
 *     `submit` rows have a NULL actor on EVM and a set one on Solana — the
 *     worker would see their own submission on one chain and not the other;
 *   - `resolveUserByWallet` returns null for any wallet not linked to a user,
 *     so ANY row can land with a NULL actor.
 * The escrow's `creator_id`/`counterparty_id` columns have none of those
 * holes, and `/v1/users/:id/transactions/summary` already derives its
 * earned/spent totals from exactly those columns — so keying the feed the
 * same way is what keeps the feed and the headline totals agreeing.
 */

import type { PartyRole } from '../utils/parties'
import { ESCROW_TX_TYPES, type EscrowTxType } from './escrow'

/**
 * - `always` — role-derived, no actor lookup needed.
 * - `actor`  — this type can be performed by EITHER party, so the row is only
 *   yours if `actor_id` says so. Consumers must treat a NULL actor as "show
 *   to both parties": hiding it from everyone loses the row for good.
 * - `never`  — not your action and no value moved to you.
 */
export type FeedVisibility = 'always' | 'actor' | 'never'

/**
 * TOTAL over `EscrowTxType`, so adding a transaction type is a compile error
 * here rather than a row that silently leaks into (or vanishes from) every
 * user's wallet.
 */
export const TX_FEED_VISIBILITY: Readonly<
  Record<EscrowTxType, Readonly<Record<PartyRole, FeedVisibility>>>
> = {
  /** The poster funds the escrow (−). No counterparty exists yet. */
  create: { creator: 'always', counterparty: 'never' },
  /** The worker's own action. */
  accept: { creator: 'never', counterparty: 'always' },
  /**
   * Invisible to both, and that is not an oversight. A decline is performed by
   * the DIRECT-OFFER invitee, who is `assigned_counterparty_id` — never
   * `counterparty_id` — and the decline patch clears even that column, so no
   * role-derived rule can reach them. The poster neither acted nor was
   * credited. The notification centre is what tells them.
   */
  decline: { creator: 'never', counterparty: 'never' },
  /**
   * Approval-mode's counterpart of `accept`: the poster placed the worker.
   * Visible to BOTH, worded per side ("Worker assigned" / "Assigned to you") —
   * otherwise an approval-mode worker has no row at all for how they got the
   * gig, while an accept-mode worker does.
   */
  assign_accept: { creator: 'always', counterparty: 'always' },
  /**
   * The poster's action. It can never show on the worker's side anyway: the
   * same write clears `counterparty_id`, so the released worker stops being a
   * party to the escrow entirely.
   */
  unassign: { creator: 'always', counterparty: 'never' },
  /** The worker's own action. */
  submit: { creator: 'never', counterparty: 'always' },
  /** The poster's action AND the worker's payout (+). */
  approve: { creator: 'always', counterparty: 'always' },
  /**
   * The worker's action and their credit. Not the poster's: they did not act,
   * and their debit was already recorded on the `create` row.
   */
  claim_stalled: { creator: 'never', counterparty: 'always' },
  /** Poster's action + refund (+); the escrow is `open`, so no counterparty. */
  cancel: { creator: 'always', counterparty: 'never' },
  /** Nobody acts (the expiry sweep does), but the poster is refunded (+). */
  refund_expired: { creator: 'always', counterparty: 'never' },
  /** Refunded to the poster (+). The worker who abandoned is not credited. */
  reclaim_abandoned: { creator: 'always', counterparty: 'never' },
  /** The ONLY type either party can perform — hence actor-scoped. */
  dispute: { creator: 'actor', counterparty: 'actor' },
  /** Pays both sides, and carries no actor to scope by. */
  resolve: { creator: 'always', counterparty: 'always' },
}

/**
 * Types visible to `role` purely from the escrow's party columns. Derived, so
 * neither the SQL predicate nor any client re-lists them by hand.
 */
export function feedTxTypesFor(role: PartyRole): EscrowTxType[] {
  return ESCROW_TX_TYPES.filter((type) => TX_FEED_VISIBILITY[type][role] === 'always')
}

/**
 * Types that need the `actor_id` check on top of party membership. Derived
 * from the same table for the same reason.
 */
export const ACTOR_SCOPED_FEED_TX_TYPES: readonly EscrowTxType[] = ESCROW_TX_TYPES.filter((type) =>
  Object.values(TX_FEED_VISIBILITY[type]).includes('actor'),
)
