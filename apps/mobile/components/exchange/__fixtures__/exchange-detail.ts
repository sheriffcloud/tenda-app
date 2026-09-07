/**
 * ExchangeDetail builders for the exchange component tests.
 *
 * Shared for the same reason the gig fixtures are: a new field on the wire type
 * should break ONE file, not every test that happened to construct an offer.
 * Two hand-rolled builders is what this replaces — and the drift they hid is
 * the reason the CTA went so long assuming every offer was open to anyone.
 *
 * Lives in __fixtures__, not __tests__: jest-expo's testMatch treats every file
 * under __tests__ as a suite and fails one that declares no tests.
 */
import type { EscrowStatus, ExchangeDetail, UserRef } from '@tenda/shared'

export const SELLER_ID = 'seller-id'
export const BUYER_ID = 'buyer-id'
export const STRANGER_ID = 'stranger-id'

export function userRef(id: string, overrides: Partial<UserRef> = {}): UserRef {
  return {
    id,
    first_name: 'A',
    last_name: 'B',
    avatar_url: null,
    review_score: '0',
    is_seeker: false,
    country: 'NG',
    ...overrides,
  }
}

/**
 * An open, unrestricted offer by default — the common case. Invite-only tests
 * set `assigned_counterparty_id`, which derives `is_assigned` below.
 */
export function exchangeDetail(overrides: Partial<ExchangeDetail> = {}): ExchangeDetail {
  const offer: ExchangeDetail = {
    escrow_id: 'e1',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '100000000',
    status: 'open',
    fiat_amount: '160000',
    fiat_currency: 'NGN',
    rate: '1600',
    payment_window_seconds: 43_200,
    accept_deadline: null,
    created_at: '2026-07-01T00:00:00.000Z',
    creator: userRef(SELLER_ID),
    is_seeker: false,
    payment_proof_url: null,
    /** Visible by default; takedown tests opt in explicitly. */
    hidden: false,
    requires_approval: false,
    is_assigned: false,
    assigned_counterparty_id: null,
    dispute_bond_raw: '0',
    completion_deadline: null,
    submitted_at: null,
    approval_deadline: null,
    counterparty: null,
    proofs: [],
    dispute: null,
    reviews: [],
    payout_account: null,
    ...overrides,
  }
  // Derived, not defaulted — same rule as the gig fixture. Setting an assignee
  // alone must not produce an offer the server could never send (someone
  // invited, yet the offer still reading as open to anyone). An explicit
  // `is_assigned` override still wins: flag set with the id withheld IS what an
  // outsider receives, and the tests that matter here assert on exactly that.
  return {
    ...offer,
    is_assigned: overrides.is_assigned ?? offer.assigned_counterparty_id !== null,
  }
}

/** An offer at `status` with the buyer installed as counterparty. */
export function matchedOffer(
  status: EscrowStatus,
  overrides: Partial<ExchangeDetail> = {},
): ExchangeDetail {
  return exchangeDetail({ status, counterparty: userRef(BUYER_ID), ...overrides })
}
