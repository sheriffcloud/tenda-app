/**
 * Intent lifecycle ops the user drives: initiate (quote → awaiting_*) and
 * cancel. Initiate PROMOTES a cached quote into a durable fiat_intents row,
 * reusing the quote id as the PK so the client's intent_id is stable. The
 * atomic `quoteCache.take` is the concurrency guard (one initiate per quote);
 * the committed row then rides the store's status-guarded `transition()` for
 * the rest of its life so webhooks/reconcile can't regress it.
 *
 * The economic terms come from the server-frozen quote, never the request —
 * the client sends only intent_id (+ bank account), so the price can't be
 * tampered with between quote and commit.
 */

import { AppError } from '@server/lib/errors'
import { ErrorCode, payoutCurrencyForCountry } from '@tenda/shared'
import type {
  BankAccountRef,
  DepositInstruction,
  FiatDirection,
  FiatIntentRow,
  PaymentInstruction,
} from '../types'
import type { FiatDeps } from './deps'

export interface InitiateOutput {
  intent_id: string
  status: FiatIntentRow['status']
  instruction: PaymentInstruction | DepositInstruction
  kyc_url: string | null
}

export interface InitiateOpts {
  bank_account?: BankAccountRef
  payout_account_id?: string
  /** Guard consolidated from the routes: the quote must be this direction. */
  expected_direction?: FiatDirection
  /**
   * Offramp only: the payout account's country. Its derived currency must
   * match the quote's — a KES account can't back an NGN cash-out.
   */
  payout_country?: string
}

/**
 * The error for a quote that isn't takeable: a committed row under this id
 * means "already initiated" (409); otherwise it's expired/consumed (410).
 * Shared by the peek-miss and take-miss (raced) paths so they can't drift.
 */
async function quoteGoneError(deps: FiatDeps, intent_id: string, user_id: string): Promise<AppError> {
  const existing = await deps.store.getIntent(intent_id)
  if (existing !== null && existing.user_id === user_id) {
    return new AppError(409, ErrorCode.VALIDATION_ERROR, `intent is ${existing.status}, expected quoted`)
  }
  return new AppError(410, ErrorCode.QUOTE_EXPIRED, 'quote expired, request a new one')
}

export async function initiateIntent(
  deps: FiatDeps,
  user_id: string,
  intent_id: string,
  opts: InitiateOpts,
): Promise<InitiateOutput> {
  // Non-consuming read for the guards: a failed guard must not burn a valid
  // quote (e.g. a wrong-direction call the client can correct and retry).
  const quote = await deps.quoteCache.peek(intent_id)
  if (quote === null) {
    throw await quoteGoneError(deps, intent_id, user_id)
  }
  if (quote.user_id !== user_id) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')
  }
  if (opts.expected_direction !== undefined && quote.direction !== opts.expected_direction) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `intent is not an ${opts.expected_direction}`)
  }
  if (
    opts.payout_country !== undefined &&
    payoutCurrencyForCountry(opts.payout_country) !== quote.fiat_currency
  ) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'payout account currency does not match the offramp currency',
    )
  }
  if (quote.direction === 'offramp' && opts.bank_account === undefined) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'bank_account_id required for offramp')
  }

  const provider = deps.providers.get(quote.provider)
  if (provider === undefined) {
    throw new AppError(503, ErrorCode.PROVIDER_UNAVAILABLE, 'provider no longer available')
  }

  // Atomic consume — the concurrency guard. Only one initiate wins the quote;
  // a lost race (or an expiry since the peek) yields null → already-done/expired.
  const taken = await deps.quoteCache.take(intent_id)
  if (taken === null) {
    throw await quoteGoneError(deps, intent_id, user_id)
  }

  const result = await provider.initiate({
    quote_ref: taken.quote_ref,
    user_id,
    wallet_address: taken.wallet_address,
    direction: taken.direction,
    quote: {
      fiat_currency: taken.fiat_currency,
      fiat_amount: Number(taken.fiat_amount),
      asset: taken.asset,
      asset_amount_raw: taken.asset_amount_raw,
      rate: Number(taken.rate),
    },
    bank_account: opts.bank_account,
    payout_account_id: opts.payout_account_id,
  })

  // Commit the durable row. KYC redirect parks it on the provider until the
  // user returns; otherwise it awaits the user's on/off-chain leg.
  const next = result.kyc_url !== null ? 'awaiting_provider' : 'awaiting_user'
  const inserted = await deps.store.insertIntent({
    id: taken.id,
    direction: taken.direction,
    user_id,
    wallet_address: taken.wallet_address,
    chain_id: taken.chain_id,
    provider: taken.provider,
    fiat_currency: taken.fiat_currency,
    fiat_amount: taken.fiat_amount,
    asset: taken.asset,
    asset_amount_raw: taken.asset_amount_raw,
    rate: taken.rate,
    fee_amount: taken.fee_amount,
    status: next,
    provider_ref: result.provider_ref,
    kyc_required: taken.kyc_required,
    kyc_url: result.kyc_url,
    expires_at: new Date(taken.expires_at),
    // Persisted so a mid-flow app restart can resume the instruction.
    metadata: {
      quote_ref: taken.quote_ref,
      ...(taken.gig_id !== undefined ? { gig_id: taken.gig_id } : {}),
      instruction: result.instruction,
    },
  })
  return {
    intent_id: inserted.id,
    status: inserted.status,
    instruction: result.instruction,
    kyc_url: result.kyc_url,
  }
}

export async function cancelIntent(deps: FiatDeps, user_id: string, intent_id: string): Promise<void> {
  // A pre-commit quote lives only in the cache: verify ownership WITHOUT
  // consuming, then drop it (nothing was ever persisted).
  const quote = await deps.quoteCache.peek(intent_id)
  if (quote !== null) {
    if (quote.user_id !== user_id) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')
    }
    await deps.quoteCache.take(intent_id)
    return
  }
  // Otherwise it's a committed intent. Verify OWNERSHIP first — store.transition
  // guards on id+status only, not user, so cancelling without this check would
  // let anyone cancel another user's intent by id.
  const existing = await deps.store.getIntent(intent_id)
  if (existing === null || existing.user_id !== user_id) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')
  }
  // Only awaiting_user can be cancelled (in-flight provider work can't be
  // unilaterally abandoned).
  const updated = await deps.store.transition(intent_id, ['awaiting_user'], { status: 'cancelled' })
  if (updated === null) {
    throw new AppError(409, ErrorCode.VALIDATION_ERROR, `intent is ${existing.status}, cannot cancel`)
  }
}
