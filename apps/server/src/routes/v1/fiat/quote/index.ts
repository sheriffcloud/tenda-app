/**
 * POST /v1/fiat/quote (stage-8 § Onramp/Offramp pipelines, step 1-3).
 * Body:
 *   { direction: 'onramp',  fiat_currency, fiat_amount, asset, chain_id,
 *     wallet_address, gig_id? }
 *   { direction: 'offramp', fiat_currency, asset, asset_amount_raw,
 *     chain_id, wallet_address }
 * → QuoteResult (quote cached in Redis with a 10-min TTL, NOT a Postgres row;
 *   the durable intent is created at commit — see initiateIntent).
 */

import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { assets } from '@tenda/shared/db/schema/chains'
import { users } from '@tenda/shared/db/schema/identity'
import { ErrorCode, EXCHANGE_MAX_FIAT_AMOUNT, AMOUNT_RAW_PRECISION, SUPPORTED_CURRENCIES } from '@tenda/shared'
import type { SupportedCurrency } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isAmountRaw } from '@server/chains/types'
import { buildFiatDeps, requestQuote } from '@server/features/fiat-rails'
import { DEFAULT_FIAT_COUNTRY } from '@server/features/fiat-rails/config'
import { requireFiatRails, requireStr, optionalStr } from '@server/lib/fiat-routes'

interface Body {
  direction?: unknown
  fiat_currency?: unknown
  fiat_amount?: unknown
  asset?: unknown
  asset_amount_raw?: unknown
  chain_id?: unknown
  wallet_address?: unknown
  gig_id?: unknown
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireFiatRails],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      const b = request.body ?? {}
      const direction = b.direction
      if (direction !== 'onramp' && direction !== 'offramp') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, "direction must be 'onramp' or 'offramp'")
      }
      const fiat_currency = requireStr('fiat_currency', b.fiat_currency, 3).toUpperCase()
      if (!SUPPORTED_CURRENCIES.includes(fiat_currency as SupportedCurrency)) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `fiat_currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
        )
      }
      const asset = requireStr('asset', b.asset, 50)
      const chain_id = requireStr('chain_id', b.chain_id, 100)
      const wallet_address = requireStr('wallet_address', b.wallet_address, 100)

      let fiat_amount: number | null = null
      let asset_amount_raw: string | null = null
      if (direction === 'onramp') {
        // Upper rail mirrors the exchange-offer guard: keep absurd values a
        // clean 422 instead of overflowing fiat_intents.fiat_amount
        // numeric(20,4) at persist time (a postgres 500).
        if (
          typeof b.fiat_amount !== 'number' ||
          !Number.isFinite(b.fiat_amount) ||
          b.fiat_amount <= 0 ||
          b.fiat_amount > EXCHANGE_MAX_FIAT_AMOUNT
        ) {
          throw new AppError(
            422,
            ErrorCode.VALIDATION_ERROR,
            `fiat_amount must be a positive number ≤ ${EXCHANGE_MAX_FIAT_AMOUNT}`,
          )
        }
        fiat_amount = b.fiat_amount
      } else {
        if (!isAmountRaw(b.asset_amount_raw)) {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'asset_amount_raw must be canonical')
        }
        // Bound to the numeric(78,0) precision so an over-range value fails
        // up front instead of overflowing the column at persist time.
        if (b.asset_amount_raw.length > AMOUNT_RAW_PRECISION) {
          throw new AppError(
            422,
            ErrorCode.VALIDATION_ERROR,
            `asset_amount_raw exceeds the maximum precision of ${AMOUNT_RAW_PRECISION} digits`,
          )
        }
        asset_amount_raw = b.asset_amount_raw
      }

      // Decimals come from the asset registry, never from the client.
      const [assetRow] = await fastify.db
        .select({ decimals: assets.decimals, chain_id: assets.chain_id, is_enabled: assets.is_enabled })
        .from(assets)
        .where(eq(assets.id, asset))
        .limit(1)
      if (assetRow === undefined || assetRow.chain_id !== chain_id || !assetRow.is_enabled) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'unknown asset for this chain')
      }

      const deps = await buildFiatDeps(fastify)
      // Country from the row, not the JWT, claims go stale for up to the
      // token lifetime (same rationale as the gig create-detail route).
      const [me] = await fastify.db
        .select({ country: users.country })
        .from(users)
        .where(eq(users.id, request.user.id))
        .limit(1)

      return requestQuote(deps, request.user.id, {
        direction,
        fiat_currency,
        fiat_amount,
        asset,
        asset_decimals: assetRow.decimals,
        asset_amount_raw,
        country: me?.country ?? DEFAULT_FIAT_COUNTRY,
        wallet_address,
        chain_id,
        gig_id: optionalStr('gig_id', b.gig_id, 100),
      })
    },
  )
}

export default route
