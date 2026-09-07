/**
 * Live drizzle wiring of the internal P2P provider: the SOL-denominated rate
 * source, the onramp order-book matcher, and the offramp/onramp fulfilment
 * that opens v2 exchange escrows. Pure DB/RPC plumbing, the provider policy
 * lives in providers/p2p-internal; this is the adapter to live data.
 */

import type { FastifyInstance } from 'fastify'
import { and, asc, eq, gt, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { assets, escrows, exchange_details } from '@tenda/shared/db/schema'
import { getAssetRates } from '@server/lib/exchange-rates'
import { getUsdFxRates } from '@server/lib/fx-rates'
import { ASSET_META, isSupportedCurrency } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { DEFAULT_ACCEPT_WINDOW_SECONDS, ErrorCode } from '@tenda/shared'
import { P2P_INTERNAL_PAYMENT_WINDOW_SECONDS, P2P_ONRAMP_MATCH_TOLERANCE_BPS } from './config'
import type { P2pFulfilment, P2pOrderBook, RateSource } from './providers/p2p-internal'

/**
 * Mid-rate for any exchange-tradable asset, priced via CoinGecko (per-asset
 * coin id from ASSET_META). Stablecoins resolve to ~1 USD in the target fiat;
 * volatiles (SOL/ETH/CELO) to their live price.
 *
 * DIRECT FIRST, THEN CROSS THROUGH USD. CoinGecko prices in ~60 fiats and two
 * of our payout currencies are not among them — it returns no `ghs` and no
 * `kes` — so Ghana and Kenya had no instant-sell quote at all, permanently,
 * while every other market did. Crossing recovers it: CoinGecko always prices
 * in USD, and the FX feed carries USD→GHS.
 *
 * Which currencies take which path is NOT listed anywhere. The direct rate is
 * tried first and the cross is the fallback, so the day CoinGecko starts
 * returning `ghs` it is used without anyone editing a list — and a currency
 * that drops out of the feed is picked up by the cross rather than going dark.
 *
 * The peg is never assumed. The USD leg is the asset's real quoted USD price,
 * so a USDC depeg reaches the quote instead of being rounded away by a
 * hardcoded 1.0.
 *
 * Every way a rate can go missing still refuses with a 503 rather than
 * returning undefined — a quote built on undefined becomes NaN and travels a
 * long way before anything notices.
 */
export function assetRateSource(): RateSource {
  return {
    async midRate(asset, fiat_currency) {
      const meta = ASSET_META[asset]
      if (meta === undefined) {
        throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, `no rate source for asset '${asset}'`)
      }
      // Outside the vocabulary there is nothing to cross TO: the FX rates are
      // filtered to SUPPORTED_CURRENCIES, so this refuses before the second
      // feed is called rather than after it answers uselessly.
      //
      // Its own message, not the shared "no rate" one. All three currency
      // refusals are 503 and all name the currency, so the message is the only
      // thing that says WHY — and this one is a CALLER error (a currency we do
      // not settle in), while the other two are upstream feeds being degraded.
      // Those want different responses from whoever reads the log.
      if (!isSupportedCurrency(fiat_currency)) {
        throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, `currency '${fiat_currency}' is not supported`)
      }

      const { rates } = await getAssetRates(meta.coingeckoId)
      const direct = rates[fiat_currency]
      if (direct !== undefined) return direct

      // No direct pair. Cross: (asset → USD) × (USD → fiat). The two legs are
      // checked separately, and in this order, because without the USD leg
      // there is nothing to multiply — so refusing here spares the FX feed a
      // call whose answer could not be used either way. A two-hop rate with a
      // hole in it is not more available than no rate, only harder to notice.
      const usd = rates.USD
      if (usd === undefined) {
        // Names the ASSET, because that is where this one went wrong: the price
        // feed answered without a USD price, so the fault is the crypto leg
        // rather than anything to do with the currency asked for.
        throw new AppError(
          503,
          ErrorCode.SERVICE_UNAVAILABLE,
          `no USD price for asset '${asset}', cannot price '${fiat_currency}'`,
        )
      }
      const fx = (await getUsdFxRates()).rates[fiat_currency]
      if (fx === undefined) {
        throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, `no rate for currency '${fiat_currency}'`)
      }
      return usd * fx
    },
  }
}

/** Live-offer conditions shared by the order book and the initiate re-check. */
function liveOfferConditions(now: Date): SQL[] {
  return [
    eq(escrows.kind, 'exchange'),
    eq(escrows.status, 'open'),
    eq(escrows.hidden, false),
    or(isNull(escrows.accept_deadline), gt(escrows.accept_deadline, now)) as SQL,
  ]
}

/**
 * Onramp matching (CO4): exchange escrows are all-or-nothing, so the best
 * match is the live offer whose fiat size sits closest to the request within
 * ±tolerance. The buyer's own offers never match.
 */
export function drizzleP2pOrderBook(fastify: FastifyInstance): P2pOrderBook {
  return {
    async bestMatch({ buyer_id, asset, fiat_currency, fiat_amount }) {
      const tolerance = P2P_ONRAMP_MATCH_TOLERANCE_BPS / 10_000
      const lo = (fiat_amount * (1 - tolerance)).toFixed(4)
      const hi = (fiat_amount * (1 + tolerance)).toFixed(4)
      const [row] = await fastify.db
        .select({
          offer_id: escrows.id,
          fiat_amount: exchange_details.fiat_amount,
          asset_amount_raw: escrows.amount_raw,
          rate: exchange_details.rate,
        })
        .from(escrows)
        .innerJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
        .where(
          and(
            ...liveOfferConditions(new Date()),
            eq(escrows.asset, asset),
            ne(escrows.creator_id, buyer_id),
            eq(exchange_details.fiat_currency, fiat_currency),
            sql`${exchange_details.fiat_amount} BETWEEN ${lo} AND ${hi}`,
          ),
        )
        // Closest size first; cheapest rate breaks ties.
        .orderBy(
          sql`ABS(${exchange_details.fiat_amount} - ${fiat_amount.toFixed(4)})`,
          asc(exchange_details.rate),
        )
        .limit(1)
      if (row === undefined) return null
      return {
        offer_id: row.offer_id,
        fiat_amount: Number(row.fiat_amount),
        asset_amount_raw: row.asset_amount_raw,
        rate: Number(row.rate),
      }
    },
  }
}

/**
 * Offramp via the v2 exchange: open a sell escrow (kind='exchange', draft) on
 * the user's behalf, the user publishes it from the exchange surface (signs
 * the escrow tx), buyers fulfil, and `status` maps the escrow lifecycle.
 * Onramp (CO4): re-validate the quote-time matched offer and hand it to the
 * buyer to accept on-chain.
 */
export function drizzleP2pFulfilment(fastify: FastifyInstance): P2pFulfilment {
  return {
    async open(input) {
      if (input.direction === 'onramp') {
        if (input.offer_ref === undefined) {
          throw new AppError(503, ErrorCode.PROVIDER_UNAVAILABLE, 'onramp intent carries no matched offer')
        }
        // The offer may have been accepted/cancelled/hidden since the quote,
        // re-check it is still live and not the buyer's own.
        const [offer] = await fastify.db
          .select({ id: escrows.id })
          .from(escrows)
          .where(
            and(
              ...liveOfferConditions(new Date()),
              eq(escrows.id, input.offer_ref),
              ne(escrows.creator_id, input.user_id),
            ),
          )
          .limit(1)
        if (offer === undefined) {
          throw new AppError(503, ErrorCode.PROVIDER_UNAVAILABLE, 'the matched offer is no longer available')
        }
        return { offer_id: offer.id }
      }
      // The asset registry owns the asset → chain mapping.
      const [asset] = await fastify.db
        .select({ chain_id: assets.chain_id })
        .from(assets)
        .where(eq(assets.id, input.asset))
        .limit(1)
      if (asset === undefined) {
        throw new AppError(
          503,
          ErrorCode.PROVIDER_UNAVAILABLE,
          `asset '${input.asset}' is not registered, cannot open a p2p offer`,
        )
      }
      // Escrow + details land together or not at all. The deadlines are
      // stamped HERE so the draft is publishable as-is via build-create,
      // accept window = the shared default; completion window = the time the
      // buyer gets to pay fiat after accepting.
      const escrow_id = await fastify.db.transaction(async (tx) => {
        const [escrow] = await tx
          .insert(escrows)
          .values({
            kind: 'exchange',
            chain_id: asset.chain_id,
            asset: input.asset,
            amount_raw: input.asset_amount_raw,
            creator_id: input.user_id,
            status: 'draft',
            // Stated, not left to the column default: this row's window is the
            // fact `prepareDraftCreate` re-derives the deadline from at build
            // (#41), so the two must be written from the same constant here.
            accept_window_seconds: DEFAULT_ACCEPT_WINDOW_SECONDS,
            accept_deadline: new Date(Date.now() + DEFAULT_ACCEPT_WINDOW_SECONDS * 1000),
            completion_duration_seconds: P2P_INTERNAL_PAYMENT_WINDOW_SECONDS,
          })
          .returning({ id: escrows.id })
        await tx.insert(exchange_details).values({
          escrow_id: escrow.id,
          fiat_amount: input.fiat_amount.toFixed(4),
          fiat_currency: input.fiat_currency,
          rate: String(input.rate),
          payment_window_seconds: P2P_INTERNAL_PAYMENT_WINDOW_SECONDS,
          // The seller's payout account so the matched buyer knows where to pay.
          payout_account_id: input.payout_account_id ?? null,
        })
        return escrow.id
      })
      return { offer_id: escrow_id }
    },

    async status(offer_id, ctx) {
      const [escrow] = await fastify.db
        .select({
          status: escrows.status,
          counterparty_id: escrows.counterparty_id,
          hidden: escrows.hidden,
          accept_deadline: escrows.accept_deadline,
        })
        .from(escrows)
        .where(eq(escrows.id, offer_id))
        .limit(1)
      if (escrow === undefined) return 'not_found'

      // Onramp: the intent only completes if the offer settled with THIS
      // buyer. A rival accepting (or the seller cancelling, a takedown, or the
      // window lapsing) means the match is gone, fail the intent so the buyer
      // re-quotes instead of waiting on someone else's trade.
      if (ctx?.direction === 'onramp') {
        const mine = escrow.counterparty_id === ctx.user_id
        if (escrow.status === 'completed' || escrow.status === 'resolved') {
          return mine ? 'completed' : 'failed'
        }
        if (escrow.status === 'accepted' || escrow.status === 'submitted' || escrow.status === 'disputed') {
          return mine ? 'pending' : 'failed'
        }
        if (escrow.status === 'open') {
          const live =
            !escrow.hidden &&
            (escrow.accept_deadline === null || escrow.accept_deadline.getTime() > Date.now())
          return live ? 'pending' : 'failed'
        }
        // draft / cancelled / refunded, the offer never traded (with anyone).
        return 'failed'
      }

      // Offramp (the intent user IS the offer creator): the escrow's own
      // lifecycle is the intent's lifecycle.
      if (escrow.status === 'completed' || escrow.status === 'resolved') return 'completed'
      if (escrow.status === 'cancelled' || escrow.status === 'refunded') return 'failed'
      return 'pending'
    },
  }
}
