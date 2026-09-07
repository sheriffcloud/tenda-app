/**
 * expire-fiat-quotes must NOT fail a P2P offramp intent once its offer is
 * opened (status 'awaiting_user'). Regression for the false "cash-out failed,
 * quote expired" push a seller got AFTER creating + publishing their offer:
 * the published offer is live for hours/days, governed by its own
 * accept_deadline + reconcile — not the 10-minute quote TTL.
 *
 * DB-backed (exercises the real listExpiredAwaitingUser SQL); gated on
 * TEST_DATABASE_URL. Pre-commit quotes are no longer Postgres rows (Redis
 * cache), so this scans only committed awaiting_user intents.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { P2P_PROVIDER_ID } from '@tenda/shared'
import { fiat_providers } from '@tenda/shared/db/schema/fiat'
import { drizzleFiatStore } from '@server/features/fiat-rails'
import type { FiatIntentStatus } from '@tenda/shared/db/schema/fiat'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_ASSET,
  useTestApp,
  createUser,
} from '../helpers/test-app'

// A licensed provider distinct from p2p_internal — fiat_intents.provider FKs
// fiat_providers, so the row must exist for the 'yellowcard' seed below.
const LICENSED_PROVIDER = 'yellowcard'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const PAST = new Date(Date.now() - 60_000)
const FUTURE = new Date(Date.now() + 600_000)

async function seedIntent(
  app: ReturnType<typeof getApp>,
  user_id: string,
  over: { provider: string; status: FiatIntentStatus; expires_at: Date },
) {
  return drizzleFiatStore(app.db).insertIntent({
    id: randomUUID(),
    direction: 'offramp',
    user_id,
    wallet_address: 'SellerWallet111111111111111111111111111111',
    chain_id: TEST_CHAIN_ID,
    fiat_currency: 'NGN',
    fiat_amount: '10000.0000',
    asset: TEST_ASSET,
    asset_amount_raw: '2000000',
    rate: '5000.0000000000',
    fee_amount: '0',
    provider_ref: 'ref-1',
    kyc_required: false,
    kyc_url: null,
    metadata: null,
    ...over,
  })
}

test('listExpiredAwaitingUser: expires stale licensed intents, skips opened p2p offers', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await app.db.insert(fiat_providers).values({
    id: LICENSED_PROVIDER,
    display_name: 'Yellow Card',
    capabilities: { onramp: true, offramp: true, currencies: ['NGN'], assets: ['*'] },
    priority: 50,
    is_enabled: true,
  })

  const opened = await seedIntent(app, u.row.id, {
    provider: P2P_PROVIDER_ID, status: 'awaiting_user', expires_at: PAST,
  })
  const licensed = await seedIntent(app, u.row.id, {
    provider: LICENSED_PROVIDER, status: 'awaiting_user', expires_at: PAST,
  })
  const notYetExpired = await seedIntent(app, u.row.id, {
    provider: P2P_PROVIDER_ID, status: 'awaiting_user', expires_at: FUTURE,
  })

  const expired = await drizzleFiatStore(app.db).listExpiredAwaitingUser(new Date(), 100)
  const ids = new Set(expired.map((r) => r.id))

  assert.ok(!ids.has(opened.id), 'a live p2p offer must NOT be quote-expired')
  assert.ok(!ids.has(notYetExpired.id), 'future expiry excluded')
  assert.ok(ids.has(licensed.id), 'licensed deposit instruction still expires on TTL')
})
