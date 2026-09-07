/**
 * Fiat-rails wire contract (stage-8-fiat-rails.md § Mobile). Mirrors the
 * server's /v1/fiat/* + /v1/bank-accounts responses exactly — amounts ride
 * as numeric strings where the DB stores numerics.
 */

import type { Endpoint } from '../endpoint'
import type { PayoutRailKind } from '../../fiat/payout/types'

export type FiatDirection = 'onramp' | 'offramp'

export type FiatIntentStatus =
  | 'quoted'
  | 'awaiting_user'
  | 'awaiting_provider'
  | 'settling'
  | 'settled'
  | 'failed'
  | 'cancelled'

export interface FiatQuoteBody {
  direction: FiatDirection
  /** ISO-4217, e.g. 'NGN'. */
  fiat_currency: string
  /** Onramp only — what the user pays. */
  fiat_amount?: number
  /** Asset registry id, e.g. 'SOL_DEVNET', 'USDC_SOL'. */
  asset: string
  /** Offramp only — raw units the user sends. */
  asset_amount_raw?: string
  chain_id: string
  wallet_address: string
  /** Optional analytics linkage for the chained buy-then-post flow. */
  gig_id?: string
}

export interface FiatQuoteResponse {
  intent_id: string
  provider: string
  rate: number
  fee_amount: number
  fiat_amount: number
  asset_amount_raw: string
  kyc_required: boolean
  expires_at: string
}

export type FiatInstruction =
  | { kind: 'bank_transfer'; bank_name: string; account_number: string; account_name: string; narration: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'ussd'; code: string }
  | { kind: 'p2p'; offer_id: string }
  /** Offramp deposit target (no `kind` discriminant on the wire). */
  | { deposit_address: string; memo: string | null }

export interface FiatInitiateBody {
  intent_id: string
}

export interface FiatOfframpInitiateBody extends FiatInitiateBody {
  bank_account_id: string
}

export interface FiatInitiateResponse {
  intent_id: string
  status: FiatIntentStatus
  instruction: FiatInstruction
  kyc_url: string | null
}

export interface FiatIntentDetail {
  id: string
  direction: FiatDirection
  status: FiatIntentStatus
  provider: string
  fiat_currency: string
  /** numeric(20,4) as string. */
  fiat_amount: string
  asset: string
  asset_amount_raw: string
  /** numeric(30,10) as string. */
  rate: string
  fee_amount: string
  kyc_required: boolean
  kyc_url: string | null
  expires_at: string
  instruction: FiatInstruction | null
  created_at: string
}

export interface BankAccountSummary {
  id: string
  country: string
  kind: PayoutRailKind
  bank_code: string
  account_number_masked: string
  account_name: string
  is_default: boolean
  verified: boolean
  created_at: string
}

export interface CreateBankAccountBody {
  country: string
  /** Payout rail; defaults to 'bank' when omitted (back-compat). */
  kind?: PayoutRailKind
  bank_code: string
  account_number: string
  /** Required while name-enquiry is unconfigured; ignored once live. */
  account_name?: string
  is_default?: boolean
}

export interface FiatContract {
  quote: Endpoint<'POST', undefined, FiatQuoteBody, undefined, FiatQuoteResponse>
  onramp: Endpoint<'POST', undefined, FiatInitiateBody, undefined, FiatInitiateResponse>
  offramp: Endpoint<'POST', undefined, FiatOfframpInitiateBody, undefined, FiatInitiateResponse>
  intent: Endpoint<'GET', { id: string }, undefined, undefined, FiatIntentDetail>
  cancelIntent: Endpoint<'POST', { id: string }, undefined, undefined, { cancelled: true }>
  bankAccounts: Endpoint<'GET', undefined, undefined, undefined, BankAccountSummary[]>
  createBankAccount: Endpoint<'POST', undefined, CreateBankAccountBody, undefined, BankAccountSummary>
  deleteBankAccount: Endpoint<'DELETE', { id: string }, undefined, undefined, { deleted: true }>
}
