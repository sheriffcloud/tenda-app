import type { ExchangeDetail, ExchangePayoutAccount, UserRef } from '@tenda/shared'

/**
 * Fully-typed ExchangeDetail for tests and the e2e stub — typed against
 * the REAL wire types so a schema change breaks the build here.
 */
export function makeUserRef(overrides: Partial<UserRef> & { id: string }): UserRef {
  return {
    first_name: 'Ada',
    last_name: 'Okafor',
    avatar_url: null,
    review_score: null,
    is_seeker: false,
    is_agent: false,
    country: 'NG',
    ...overrides,
  }
}

export function makeExchangeDetail(
  overrides: Partial<ExchangeDetail> = {},
): ExchangeDetail {
  return {
    escrow_id: 'exch-1',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '50000000',
    status: 'open',
    fiat_amount: '75000.0000',
    fiat_currency: 'NGN',
    rate: '1500.0000000000',
    payment_window_seconds: 3600,
    accept_deadline: null,
    created_at: '2026-08-15T10:00:00.000Z',
    creator: makeUserRef({ id: 'seller-1' }),
    hidden: false,
    is_seeker: false,
    payment_proof_url: null,
    my_signer_address: null,
    dispute_bond_raw: '0',
    completion_deadline: null,
    submitted_at: null,
    approval_deadline: null,
    requires_approval: false,
    is_assigned: false,
    assigned_counterparty_id: null,
    counterparty: null,
    proofs: [],
    dispute: null,
    reviews: [],
    payout_account: null,
    ...overrides,
  }
}

export function makePayoutAccount(
  overrides: Partial<ExchangePayoutAccount> = {},
): ExchangePayoutAccount {
  return {
    kind: 'bank',
    bank_code: '058',
    account_number: '0123456789',
    account_name: 'Ada Okafor',
    country: 'NG',
    ...overrides,
  }
}
