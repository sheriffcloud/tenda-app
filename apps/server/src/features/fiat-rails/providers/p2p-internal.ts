/**
 * p2p_internal provider, the always-available fallback AND the canonical
 * home of the exchange primitive (locked decision #14; stage-8 § Provider
 * routing). Quotes at the platform mid-rate plus a fixed spread; initiate
 * surfaces the intent on the P2P exchange where existing offers fulfil it.
 *
 * Settlement is driven by the exchange flow's own events, not a provider
 * webhook, the reconcile job treats matched-and-confirmed exchanges as
 * completed (see `P2pFulfilment` seam).
 *
 * STATELESS between quote and initiate: deps are rebuilt per request, so
 * initiate consumes the quote snapshot the service re-supplies from the
 * intent row instead of any in-memory cache.
 */

import { randomUUID } from 'node:crypto'
import { AppError } from '@server/lib/errors'
import { ErrorCode, formatUnits } from '@tenda/shared'
import { P2P_INTERNAL_ID, P2P_INTERNAL_SPREAD_BPS } from '../config'
import type {
  FiatProvider,
  ProviderCapabilities,
  ProviderQuote,
  ProviderIntentStatus,
  ProviderStatusContext,
} from '../types'

/** Mid-rate source: fiat per display unit of asset (e.g. NGN per USDC). */
export interface RateSource {
  midRate(asset: string, fiat_currency: string): Promise<number>
}

/** A live sell offer the onramp side can quote against (CO4). */
export interface P2pOpenOffer {
  offer_id: string
  fiat_amount: number
  asset_amount_raw: string
  rate: number
}

/**
 * Order-book read seam (CO4 onramp): the buyer's quote is grounded in a
 * REAL open sell offer, no offer, no quote. Exchange escrows are
 * all-or-nothing (the buyer accepts the whole offer), so matching is
 * size-tolerant, never partial.
 */
export interface P2pOrderBook {
  bestMatch(input: {
    buyer_id: string
    asset: string
    fiat_currency: string
    fiat_amount: number
  }): Promise<P2pOpenOffer | null>
}

/**
 * Exchange-side fulfilment seam. `open` posts (offramp) or re-validates
 * (onramp, via offer_ref) an offer for the intent; `status` reports how
 * the exchange leg is doing. The drizzle implementation rides the
 * existing exchange feature tables.
 */
export interface P2pFulfilment {
  open(input: {
    user_id: string
    direction: 'onramp' | 'offramp'
    fiat_currency: string
    fiat_amount: number
    asset: string
    asset_amount_raw: string
    rate: number
    /** Onramp: the quote-time matched offer to re-validate. */
    offer_ref?: string
    /** Offramp: the seller's payout account, persisted on the new offer. */
    payout_account_id?: string
  }): Promise<{ offer_id: string }>
  status(offer_id: string, ctx?: ProviderStatusContext): Promise<ProviderIntentStatus>
}

export interface P2pInternalDeps {
  rates: RateSource
  book: P2pOrderBook
  fulfilment: P2pFulfilment
  /** Declared by the fulfilment implementation. */
  capabilities: ProviderCapabilities
  now(): Date
}

export function p2pInternalProvider(deps: P2pInternalDeps): FiatProvider {
  return {
    id: P2P_INTERNAL_ID,
    capabilities: deps.capabilities,

    async quote(req) {
      // Onramp (CO4): quote FROM the order book, the buyer gets a real
      // offer's exact terms, or no quote at all.
      if (req.direction === 'onramp') {
        if (req.fiat_amount === null || req.fiat_amount <= 0) {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'fiat_amount required for onramp quotes')
        }
        const offer = await deps.book.bestMatch({
          buyer_id: req.user_id,
          asset: req.asset,
          fiat_currency: req.fiat_currency,
          fiat_amount: req.fiat_amount,
        })
        if (offer === null) {
          throw new AppError(
            503,
            ErrorCode.PROVIDER_UNAVAILABLE,
            'no open sell offer matches this amount',
          )
        }
        return {
          // The offer id IS the quote ref, initiate re-validates it.
          quote_ref: offer.offer_id,
          rate: offer.rate,
          fee_amount: 0,
          fiat_amount: offer.fiat_amount,
          asset_amount_raw: offer.asset_amount_raw,
          kyc_required: false,
          kyc_url: null,
        }
      }

      // Offramp: synthetic quote at mid − spread; initiate opens a fresh
      // sell offer at this rate.
      const mid = await deps.rates.midRate(req.asset, req.fiat_currency)
      if (!Number.isFinite(mid) || mid <= 0) {
        throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'no exchange rate available')
      }
      // Spread protects matched counterparties from quoting at exact mid.
      const spread = P2P_INTERNAL_SPREAD_BPS / 10_000
      const rate = mid * (1 - spread)

      if (req.asset_amount_raw === null) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'asset_amount_raw required for offramp quotes')
      }
      // BigInt-exact base-units → display; Number() is safe here because the
      // decimal string is small-magnitude (float would corrupt 18-dp raw).
      const display = Number(formatUnits(req.asset_amount_raw, req.asset_decimals))
      const fiat_amount = Math.floor(display * rate * 100) / 100

      const quote: ProviderQuote = {
        quote_ref: randomUUID(),
        rate,
        // No Tenda margin on conversion (stage-8 open questions: pass-through).
        fee_amount: 0,
        fiat_amount,
        asset_amount_raw: req.asset_amount_raw,
        kyc_required: false,
        kyc_url: null,
      }
      return quote
    },

    async initiate({ user_id, direction, quote, quote_ref, payout_account_id }) {
      const { offer_id } = await deps.fulfilment.open({
        user_id,
        direction,
        fiat_currency: quote.fiat_currency,
        fiat_amount: quote.fiat_amount,
        asset: quote.asset,
        asset_amount_raw: quote.asset_amount_raw,
        rate: quote.rate,
        // Onramp: quote_ref carries the matched offer id (see quote()).
        ...(direction === 'onramp' ? { offer_ref: quote_ref } : {}),
        // Offramp: persist the seller's payout account on the new offer.
        ...(direction === 'offramp' && payout_account_id !== undefined ? { payout_account_id } : {}),
      })
      return {
        provider_ref: offer_id,
        instruction: { kind: 'p2p', offer_id },
        kyc_url: null,
      }
    },

    async status(provider_ref, ctx) {
      return deps.fulfilment.status(provider_ref, ctx)
    },
  }
}
