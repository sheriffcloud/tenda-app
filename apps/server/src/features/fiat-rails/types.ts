/**
 * Fiat-rails contracts (stage-8-fiat-rails.md § Provider interface).
 *
 * Tenda NEVER holds fiat: providers move money provider ↔ user directly;
 * intents only track the operation. Onramp/offramp are escrow-independent
 * (locked decision #15), no escrow linkage anywhere in this module.
 */

import type { FiatDirection, FiatIntentStatus } from '@tenda/shared/db/schema/fiat'

export type { FiatDirection, FiatIntentStatus }

// ---------- quotes ---------------------------------------------------------

export interface QuoteRequest {
  direction: FiatDirection
  /**
   * Quoting user, the internal order book excludes their own offers
   * (you can't buy from yourself). Licensed providers ignore it.
   */
  user_id: string
  /** ISO-4217, e.g. 'NGN'. */
  fiat_currency: string
  /**
   * Onramp: the fiat the user pays. Offramp: derived from asset_amount_raw
   * via the provider rate (the provider quotes what the bank receives).
   */
  fiat_amount: number | null
  /** Asset registry id, e.g. 'USDC_SOL'. */
  asset: string
  asset_decimals: number
  /** Offramp only, raw units the user will send. */
  asset_amount_raw: string | null
  /** User country, ISO 3166-1 alpha-2, routing input. */
  country: string
}

export interface ProviderQuote {
  /** Provider-side quote reference (opaque). */
  quote_ref: string
  /** Fiat per display unit of asset. */
  rate: number
  /** Provider fee in fiat. */
  fee_amount: number
  /** Fiat the user pays (onramp) or receives (offramp). */
  fiat_amount: number
  /** Raw asset units delivered (onramp) or required (offramp). */
  asset_amount_raw: string
  kyc_required: boolean
  kyc_url: string | null
}

// ---------- instructions ----------------------------------------------------

/** How the user pays the provider (onramp). */
export type PaymentInstruction =
  | {
      kind: 'bank_transfer'
      bank_name: string
      account_number: string
      account_name: string
      /** MUST appear in the transfer narration, provider matching key. */
      narration: string
    }
  | { kind: 'redirect'; url: string }
  | { kind: 'ussd'; code: string }
  | {
      /** P2P internal, the exchange surface fulfils the intent. */
      kind: 'p2p'
      offer_id: string
    }

/** Where the user sends USDC (offramp). */
export interface DepositInstruction {
  deposit_address: string
  /** Memo/reference the transfer must carry, when the provider needs one. */
  memo: string | null
}

export interface InitiateResult {
  provider_ref: string
  instruction: PaymentInstruction | DepositInstruction
  /** Some providers gate the first intent behind hosted KYC. */
  kyc_url: string | null
}

/**
 * Quote snapshot the service re-supplies at initiate time from the intent
 * row, providers stay stateless between the two calls (deps are rebuilt
 * per request; in-memory provider state would not survive).
 */
export interface IntentQuoteSnapshot {
  fiat_currency: string
  fiat_amount: number
  asset: string
  asset_amount_raw: string
  rate: number
}

// ---------- provider seam ----------------------------------------------------

export type ProviderIntentStatus = 'pending' | 'completed' | 'failed' | 'not_found'

export interface ProviderCapabilities {
  onramp: boolean
  offramp: boolean
  currencies: string[]
  assets: string[]
}

/**
 * Intent context for `status()` polls. The internal order book needs to
 * know WHO the intent belongs to: an onramp intent only completed if the
 * matched offer settled with THIS buyer, a rival accepting the same
 * offer must fail the intent, not settle it. Licensed providers track
 * intents by provider_ref alone and ignore this.
 */
export interface ProviderStatusContext {
  user_id: string
  direction: FiatDirection
}

/**
 * One interface for both directions, `capabilities` says which a
 * provider supports; routing filters on it. All methods are remote calls
 * (or DB work for p2p_internal) and may throw; the service maps failures
 * to the next routing candidate.
 */
export interface FiatProvider {
  id: string
  capabilities: ProviderCapabilities
  quote(req: QuoteRequest): Promise<ProviderQuote>
  initiate(input: {
    quote_ref: string
    user_id: string
    /** Onramp: destination wallet. Offramp: source wallet. */
    wallet_address: string
    direction: FiatDirection
    quote: IntentQuoteSnapshot
    bank_account?: BankAccountRef
    /**
     * Offramp only: the caller's bank_accounts id, persisted on the P2P offer
     * this initiate opens so the matched buyer can be shown where to pay. Not
     * forwarded to external providers (bank_account carries their payload).
     */
    payout_account_id?: string
  }): Promise<InitiateResult>
  status(provider_ref: string, ctx?: ProviderStatusContext): Promise<ProviderIntentStatus>
  /** Optional pre-routing liquidity probe; absent = assumed available. */
  checkLiquidity?(req: QuoteRequest): Promise<{ available: boolean }>
}

export interface BankAccountRef {
  bank_code: string
  account_number: string
  account_name: string
}

// ---------- intents (DB row projection) --------------------------------------

export interface FiatIntentRow {
  id: string
  direction: FiatDirection
  user_id: string
  wallet_address: string
  chain_id: string
  provider: string
  fiat_currency: string
  fiat_amount: string
  asset: string
  asset_amount_raw: string
  rate: string
  fee_amount: string
  status: FiatIntentStatus
  provider_ref: string | null
  kyc_required: boolean
  kyc_url: string | null
  expires_at: Date
  metadata: unknown
  created_at: Date
  updated_at: Date
}
