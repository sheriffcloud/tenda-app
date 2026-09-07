/**
 * Seeding fiat intents directly.
 *
 * There is no public route that creates an intent in an arbitrary status —
 * the initiate flow decides that itself — and the cases that need one are
 * about the status a read or an override FINDS the row in. So the row is
 * built rather than driven.
 *
 * Extracted from admin-refusals-fiat-intents.test.ts in #125, which needed the
 * same seeding for the intent-detail read. Shared rather than copied: sixteen
 * of the table's twenty columns are NOT NULL (counted, not estimated — the
 * others are `id`, which defaults, plus provider_ref, kyc_url and metadata), so
 * the literal below is long and mostly obligatory. Two drifting copies of a
 * long obligatory literal are two different fixtures wearing one name.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { fiat_intents } from '@tenda/shared/db/schema/fiat'
import { TEST_ASSET, TEST_CHAIN_ID } from './test-app'

/**
 * The only provider the harness seeds, and the FK target for every intent
 * built here. Seeding a different one means seeding a provider row first.
 */
export const TEST_FIAT_PROVIDER = 'p2p_internal'

/** Every status the column accepts. `quoted` is vestigial — see the schema. */
export type SeedIntentStatus =
  | 'quoted'
  | 'awaiting_user'
  | 'awaiting_provider'
  | 'settling'
  | 'settled'
  | 'failed'

export interface SeedIntentOptions {
  /** Defaults to 'onramp'; the offramp arm reads the same columns. */
  direction?: 'onramp' | 'offramp'
  /** Minutes from now. Negative expires the intent, for the expiry sweeps. */
  expiresInMinutes?: number
}

/**
 * Insert one intent for `user_id` in `status`, and return its id.
 *
 * The money columns are fixed rather than parameterised: no caller has needed
 * to vary them, and a fixture whose every field is an argument stops
 * documenting what a normal intent looks like. Add a field to
 * `SeedIntentOptions` when a case actually needs it.
 */
export async function seedFiatIntent(
  app: FastifyInstance,
  user_id: string,
  status: SeedIntentStatus,
  options: SeedIntentOptions = {},
): Promise<string> {
  const { direction = 'onramp', expiresInMinutes = 10 } = options
  const id = randomUUID()
  await app.db.insert(fiat_intents).values({
    id,
    direction,
    user_id,
    wallet_address: 'SolWallet1111111111111111111111111111111',
    chain_id: TEST_CHAIN_ID,
    provider: TEST_FIAT_PROVIDER,
    fiat_currency: 'NGN',
    fiat_amount: '150000.0000',
    asset: TEST_ASSET,
    asset_amount_raw: '100000000',
    rate: '1500.0000000000',
    fee_amount: '1500.0000',
    status,
    expires_at: new Date(Date.now() + expiresInMinutes * 60_000),
  })
  return id
}
