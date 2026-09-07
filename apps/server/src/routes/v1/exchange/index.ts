/**
 * Exchange order-book surface (cutover §3 rewrite): escrows kind='exchange'
 * ⨝ exchange_details ⨝ users.
 *   GET  /, the order book (auth required to keep it off public scrapers).
 *            Browsing/accepting is open to ALL users; advanced_mode_enabled
 *            gates offer CREATION only (decision #14, settled 2026-06-05).
 *   POST /, attach exchange_details to the caller's DRAFT escrow (CO4
 *            advanced-mode offer creation, mirror of the gig create-detail
 *            step). Transitions live under /v1/escrows. The data carries no
 *            payment-account PII (bank details live in fiat-rails
 *            bank_accounts, revealed only inside an accepted intent).
 */
import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { eq, and, gt, gte, isNull, lte, or, desc, sql, type SQL } from 'drizzle-orm'
import { escrows, exchange_details, users } from '@tenda/shared/db/schema'
import {
  ErrorCode,
  payoutCurrencyForCountry,
  SUPPORTED_CURRENCIES,
  EXCHANGE_PAYMENT_WINDOW_MIN_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_MAX_SECONDS,
  EXCHANGE_MAX_FIAT_AMOUNT,
  EXCHANGE_MAX_RATE,
} from '@tenda/shared'
import type { ExchangeContract, ApiError, SupportedCurrency } from '@tenda/shared'
import { isAmountRaw } from '@server/chains/types'
import { AppError } from '@server/lib/errors'
import { loadEscrowOr404 } from '@server/lib/escrow-routes'
import { assertExchangeAsset } from '@server/lib/escrow'
import { drizzleBankAccountStore } from '@server/features/fiat-rails'
import { EXCHANGE_SUMMARY_COLS, toExchangeSummary } from '@server/lib/exchange-read'
import { chainFilterCondition } from '@server/lib/chain-filter'

type ListRoute = ExchangeContract['list']
type CreateRoute = ExchangeContract['create']

const exchangeRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/exchange, order book (auth required to prevent scraping)
  fastify.get<{
    Querystring: ListRoute['query']
    Reply: ListRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { currency, chain_id, min_amount_raw, max_amount_raw, limit = 20, offset = 0 } = request.query

    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const now = new Date()
    const conditions: SQL[] = [
      eq(escrows.kind, 'exchange'),
      // Market feed: open offers whose accept window hasn't passed,
      // display-correct even between expire-escrows job ticks. Taken-down
      // offers (CO1) never surface here.
      eq(escrows.status, 'open'),
      eq(escrows.hidden, false),
      or(isNull(escrows.accept_deadline), gt(escrows.accept_deadline, now)) as SQL,
    ]

    if (currency) conditions.push(eq(exchange_details.fiat_currency, currency.toUpperCase()))

    const chainCondition = chainFilterCondition(fastify.chains, chain_id)
    if (chainCondition !== null) conditions.push(chainCondition)

    if (min_amount_raw !== undefined && !isAmountRaw(min_amount_raw)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount_raw must be a decimal integer string')
    }
    if (max_amount_raw !== undefined && !isAmountRaw(max_amount_raw)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'max_amount_raw must be a decimal integer string')
    }
    if (
      min_amount_raw !== undefined &&
      max_amount_raw !== undefined &&
      BigInt(min_amount_raw) > BigInt(max_amount_raw)
    ) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount_raw must be ≤ max_amount_raw')
    }
    if (min_amount_raw !== undefined) conditions.push(gte(escrows.amount_raw, min_amount_raw))
    if (max_amount_raw !== undefined) conditions.push(lte(escrows.amount_raw, max_amount_raw))

    const where = and(...conditions)

    const [data, countResult] = await Promise.all([
      fastify.db
        .select(EXCHANGE_SUMMARY_COLS)
        .from(escrows)
        .innerJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
        .innerJoin(users, eq(users.id, escrows.creator_id))
        .where(where)
        .limit(safeLimit)
        .offset(safeOffset)
        .orderBy(desc(escrows.created_at)),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(escrows)
        .innerJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
        .where(where),
    ])

    return {
      data: data.map(toExchangeSummary),
      total: countResult[0].count,
      limit: safeLimit,
      offset: safeOffset,
    }
  })

  // POST /v1/exchange, attach the offer terms to the caller's draft
  // escrow (CO4). Upsert while draft so a retry after a validation fix
  // never 409s; once the create tx confirms (draft → open) the satellite
  // is immutable through this route. Numbers only, no moderation gate.
  fastify.post<{
    Body: CreateRoute['body']
    Reply: CreateRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body ?? {}
    if (typeof body.escrow_id !== 'string' || body.escrow_id === '') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'escrow_id is required')
    }

    // Upper rails keep absurd values a clean 400 instead of a numeric
    // column overflow (driver error → 500) at insert time.
    const fiat_amount = body.fiat_amount
    if (
      typeof fiat_amount !== 'number' ||
      !Number.isFinite(fiat_amount) ||
      fiat_amount <= 0 ||
      fiat_amount > EXCHANGE_MAX_FIAT_AMOUNT
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `fiat_amount must be a positive number ≤ ${EXCHANGE_MAX_FIAT_AMOUNT}`,
      )
    }
    const rate = body.rate
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > EXCHANGE_MAX_RATE) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `rate must be a positive number ≤ ${EXCHANGE_MAX_RATE}`,
      )
    }
    const fiat_currency = String(body.fiat_currency ?? '').toUpperCase()
    if (!SUPPORTED_CURRENCIES.includes(fiat_currency as SupportedCurrency)) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `fiat_currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
      )
    }
    const payment_window_seconds = body.payment_window_seconds ?? EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS
    if (
      !Number.isInteger(payment_window_seconds) ||
      payment_window_seconds < EXCHANGE_PAYMENT_WINDOW_MIN_SECONDS ||
      payment_window_seconds > EXCHANGE_PAYMENT_WINDOW_MAX_SECONDS
    ) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `payment_window_seconds must be an integer between ${EXCHANGE_PAYMENT_WINDOW_MIN_SECONDS} and ${EXCHANGE_PAYMENT_WINDOW_MAX_SECONDS}`,
      )
    }

    const escrow = await loadEscrowOr404(fastify.db, body.escrow_id)
    if (escrow.creator_id !== request.user.id) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the escrow creator can attach offer terms')
    }
    if (escrow.kind !== 'exchange') {
      throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, 'Offer terms can only be attached to exchange escrows')
    }
    // Defense in depth: the asset was guarded at escrow-create, re-assert it is
    // exchange-tradable here so this route is correct independently.
    assertExchangeAsset(escrow.asset, escrow.chain_id)
    if (escrow.status !== 'draft') {
      throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, 'Offer terms can only be attached while the escrow is a draft')
    }

    // Payout target: a sell offer with nowhere for the buyer to pay can never
    // settle. Must belong to the caller and match the offer's fiat currency —
    // a KES account can't back an NGN-priced offer (checked after the escrow
    // guards so ownership/kind/status still take precedence).
    if (typeof body.payout_account_id !== 'string' || body.payout_account_id === '') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'payout_account_id is required')
    }
    const account = await drizzleBankAccountStore(fastify.db).get(request.user.id, body.payout_account_id)
    if (account === null) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'payout account not found')
    }
    if (payoutCurrencyForCountry(account.country) !== fiat_currency) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'payout account currency does not match the offer currency',
      )
    }

    const values = {
      escrow_id: escrow.id,
      fiat_amount: fiat_amount.toFixed(4),
      fiat_currency,
      rate: rate.toFixed(10),
      payment_window_seconds,
      payout_account_id: account.id,
    }
    const [row] = await fastify.db
      .insert(exchange_details)
      .values(values)
      .onConflictDoUpdate({ target: exchange_details.escrow_id, set: values })
      .returning()

    return reply.code(201).send(row)
  })
}

export default exchangeRoutes
