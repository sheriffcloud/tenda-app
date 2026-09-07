/**
 * The hard-require guarantee: when REDIS_URL is unset the quote cache is the
 * fail-loud stub — every op throws 503, so fiat quoting can never silently
 * fall back to persisting throwaway quotes in Postgres.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { unavailableQuoteCache } from '@server/plugins/quote-cache'
import type { StoredQuote } from '@server/features/fiat-rails/quote-cache'
import { AppError } from '@server/lib/errors'

const QUOTE: StoredQuote = {
  id: 'q-1',
  direction: 'offramp',
  user_id: 'u',
  wallet_address: 'W',
  chain_id: 'solana:devnet',
  provider: 'p2p_internal',
  fiat_currency: 'NGN',
  fiat_amount: '1.0000',
  asset: 'USDC_SOL',
  asset_amount_raw: '1',
  rate: '1.0000000000',
  fee_amount: '0.0000',
  kyc_required: false,
  kyc_url: null,
  quote_ref: 'r',
  expires_at: new Date().toISOString(),
}

const is503 = (e: unknown): boolean => e instanceof AppError && e.statusCode === 503

test('unavailableQuoteCache: put / peek / take all reject with 503', async () => {
  const cache = unavailableQuoteCache()
  await assert.rejects(cache.put(QUOTE, 600), is503)
  await assert.rejects(cache.peek('q-1'), is503)
  await assert.rejects(cache.take('q-1'), is503)
})
