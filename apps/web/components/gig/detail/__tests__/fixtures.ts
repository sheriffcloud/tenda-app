/**
 * GigDetail builders for the web detail-surface tests — the same derived-
 * consistency rules as shared's test fixture (an explicit `is_assigned`
 * override wins; otherwise it derives from the assignee id).
 */
import type { GigApplicant, GigDetail, UserRef } from '@tenda/shared'

// Kind-agnostic (the exchange tests build the same row); re-exported so the
// gig suites keep one import for their fixtures. Its default `raised_by` is
// CREATOR_ID's value.
export { disputeRow } from '../../../../test/factories/escrow'

export const CREATOR_ID = 'user-creator'
export const WORKER_ID = 'user-worker'
export const STRANGER_ID = 'user-stranger'

export function userRef(id: string): UserRef {
  return {
    id,
    first_name: 'Ada',
    last_name: 'Lovelace',
    avatar_url: null,
    review_score: null,
    country: 'NG',
    is_seeker: false,
    is_agent: false,
  }
}

export function gigDetail(overrides: Partial<GigDetail> = {}): GigDetail {
  const gig: GigDetail = {
    escrow_id: 'escrow-1',
    public_feed_revision: '0',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '1000000',
    status: 'open',
    accept_deadline: null,
    created_at: '2026-07-01T00:00:00.000Z',
    title: 'Paint the fence',
    description: null,
    category: 'service',
    country: 'NG',
    city: 'Lagos',
    latitude: null,
    longitude: null,
    remote: false,
    cross_border: false,
    proof_requirements: [],
    proof_params: null,
    requires_approval: false,
    hidden: false,
    creator: userRef(CREATOR_ID),
    completion_duration_seconds: 3600,
    completion_deadline: null,
    submitted_at: null,
    approval_deadline: null,
    my_signer_address: null,
    dispute_bond_raw: '0',
    assigned_counterparty_id: null,
    is_assigned: false,
    unassign_window_seconds: 3600,
    assignment_released_at: null,
    counterparty: null,
    proofs: [],
    dispute: null,
    reviews: [],
    is_seeker: false,
    viewer: null,
    ...overrides,
  }
  return {
    ...gig,
    is_assigned: overrides.is_assigned ?? gig.assigned_counterparty_id !== null,
  }
}

export function applicant(overrides: Partial<GigApplicant> = {}): GigApplicant {
  return {
    id: 'app-1',
    escrow_id: 'escrow-1',
    applicant_id: WORKER_ID,
    message: 'I can start today',
    status: 'open',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: '2026-07-01T00:00:00.000Z',
    first_name: 'Grace',
    last_name: 'Hopper',
    avatar_url: null,
    review_score: '4.50',
    ...overrides,
  }
}
