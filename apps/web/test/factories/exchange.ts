/**
 * Fully-typed ExchangeDetail for tests and the e2e stub — typed against
 * the REAL wire types so a schema change breaks the build here.
 */
import { abbreviatedName } from '@tenda/shared'
import type { ExchangeDetail, ExchangePayoutAccount, UserRef, ExchangePartyRef } from '@tenda/shared'

/** The one place this suite's stock person is named; both builders below read it. */
const FIRST_NAME = 'Ada'
const LAST_NAME = 'Okafor'

export function makeUserRef(overrides: Partial<UserRef> & { id: string }): UserRef {
  return {
    first_name: FIRST_NAME,
    last_name: LAST_NAME,
    avatar_url: null,
    review_score: null,
    is_seeker: false,
    is_agent: false,
    country: 'NG',
    ...overrides,
  }
}

/**
 * A creator as the EXCHANGE surface serves them (#175): an abbreviated label,
 * with the legal name and the face withheld unless the caller asks for them.
 *
 * Defaults to the withheld shape on purpose — that is what a stranger and the
 * whole order book receive, so a test that forgets to think about it gets the
 * restrictive case rather than the permissive one.
 *
 * `display_name` is BUILT with the helper the serializer uses, like the mobile
 * and e2e fixtures beside it — typing "Ada O." here would keep passing if the
 * abbreviation's format ever changed, which is the one thing these tests exist
 * to notice.
 */
export function makeExchangeParty(
  overrides: Partial<ExchangePartyRef> = {},
): ExchangePartyRef {
  return {
    id: 'seller-1',
    display_name: abbreviatedName(FIRST_NAME, LAST_NAME),
    review_score: null,
    is_seeker: false,
    is_agent: false,
    country: 'NG',
    full_name: null,
    avatar_url: null,
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
    creator: makeExchangeParty(),
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
