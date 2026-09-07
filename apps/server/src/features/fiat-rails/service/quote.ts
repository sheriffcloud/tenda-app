/**
 * Quote operation: route → provider.quote → cache the quote (Redis, TTL).
 * Candidates are tried in priority order; a provider that throws is skipped
 * (§ Provider routing, outage falls through, ultimately to p2p_internal).
 *
 * The quote is NOT a Postgres row: it's an ephemeral, high-churn price snapshot
 * (one per debounced keystroke), so it lives in the quote cache with a native
 * TTL. The durable fiat_intents row is created at commit (`initiateIntent`),
 * reusing this quote's id so the client's `intent_id` stays stable.
 */

import { randomUUID } from 'node:crypto'
import { AppError } from '@server/lib/errors'
import { ErrorCode, EXCHANGE_MAX_FIAT_AMOUNT } from '@tenda/shared'
import { QUOTE_TTL_MS } from '../config'
import { pickCandidates } from '../routing'
import type { QuoteRequest } from '../types'
import type { FiatDeps } from './deps'

export interface QuoteInput extends Omit<QuoteRequest, 'user_id'> {
  wallet_address: string
  chain_id: string
  /** Optional analytics linkage (chained buy-then-post flow). */
  gig_id?: string
}

export interface QuoteResult {
  intent_id: string
  provider: string
  rate: number
  fee_amount: number
  fiat_amount: number
  asset_amount_raw: string
  kyc_required: boolean
  expires_at: string
}

export async function requestQuote(
  deps: FiatDeps,
  user_id: string,
  input: QuoteInput,
): Promise<QuoteResult> {
  const candidates = pickCandidates(deps.registry, deps.providers, input)
  if (candidates.length === 0) {
    throw new AppError(503, ErrorCode.PROVIDER_UNAVAILABLE, 'no provider supports this request')
  }

  for (const provider of candidates) {
    // A provider that throws yields to the next (outage → fallback). A quote
    // that SUCCEEDS then goes through terminal validation + persist below: its
    // failures are the caller's, not "try the next provider".
    let quote: Awaited<ReturnType<typeof provider.quote>>
    try {
      quote = await provider.quote({ ...input, user_id })
    } catch (err) {
      deps.log.warn({ err, provider: provider.id }, 'fiat: provider quote failed, trying next')
      continue
    }

    // Offramp fiat is provider-computed from asset_amount_raw × rate; bound it
    // (as the onramp route bounds its input) so a large-but-in-precision amount
    // can't overflow fiat_intents.fiat_amount numeric(20,4) once committed.
    if (!Number.isFinite(quote.fiat_amount) || quote.fiat_amount > EXCHANGE_MAX_FIAT_AMOUNT) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `resulting fiat amount exceeds the maximum of ${EXCHANGE_MAX_FIAT_AMOUNT}`,
      )
    }

    // The intent id is minted HERE (not by Postgres) so it survives the
    // quote → intent promotion: the client holds it from the quote response
    // and initiate reuses it as the fiat_intents PK.
    const id = randomUUID()
    const expires_at = new Date(deps.now().getTime() + QUOTE_TTL_MS)
    await deps.quoteCache.put(
      {
        id,
        direction: input.direction,
        user_id,
        wallet_address: input.wallet_address,
        chain_id: input.chain_id,
        provider: provider.id,
        fiat_currency: input.fiat_currency,
        fiat_amount: quote.fiat_amount.toFixed(4),
        asset: input.asset,
        asset_amount_raw: quote.asset_amount_raw,
        rate: quote.rate.toFixed(10),
        fee_amount: quote.fee_amount.toFixed(4),
        kyc_required: quote.kyc_required,
        kyc_url: quote.kyc_url,
        quote_ref: quote.quote_ref,
        ...(input.gig_id !== undefined ? { gig_id: input.gig_id } : {}),
        expires_at: expires_at.toISOString(),
      },
      Math.ceil(QUOTE_TTL_MS / 1000),
    )
    return {
      intent_id: id,
      provider: provider.id,
      rate: quote.rate,
      fee_amount: quote.fee_amount,
      fiat_amount: quote.fiat_amount,
      asset_amount_raw: quote.asset_amount_raw,
      kyc_required: quote.kyc_required,
      expires_at: expires_at.toISOString(),
    }
  }
  throw new AppError(503, ErrorCode.PROVIDER_UNAVAILABLE, 'all providers failed to quote')
}
