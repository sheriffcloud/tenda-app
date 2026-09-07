/**
 * Wire serializers for the v2 read surfaces (lib/gig-read, lib/exchange-read):
 * Drizzle Date columns → ISO strings, byte-identical between listing and
 * detail responses.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { toGigSummary, type GigSummaryRow } from '@server/lib/gig-read'
import { toExchangeSummary, type ExchangeSummaryRow } from '@server/lib/exchange-read'
import type { UserRef } from '@tenda/shared'

const creator: UserRef = {
  id: 'u-1',
  first_name: 'Ada',
  last_name: 'Obi',
  avatar_url: null,
  review_score: '4.50',
  is_seeker: false,
  is_agent: false,
  country: 'NG',
}

const CREATED = new Date('2026-06-01T10:00:00.000Z')
const DEADLINE = new Date('2026-06-10T10:00:00.000Z')

function gigRow(overrides: Partial<GigSummaryRow> = {}): GigSummaryRow {
  return {
    escrow_id: 'e-1',
    public_feed_revision: '0',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '5000000',
    status: 'open',
    accept_deadline: DEADLINE,
    created_at: CREATED,
    title: 'Fix my fence',
    description: 'Wood panels',
    category: 'home_services',
    country: 'NG',
    city: 'Lagos',
    latitude: 6.45,
    longitude: 3.39,
    remote: false,
    cross_border: false,
    proof_requirements: [],
    proof_params: null,
    requires_approval: false,
    creator,
    ...overrides,
  }
}

test('toGigSummary: serializes dates to ISO strings, passes fields through', () => {
  const wire = toGigSummary(gigRow())
  assert.strictEqual(wire.accept_deadline, DEADLINE.toISOString())
  assert.strictEqual(wire.created_at, CREATED.toISOString())
  assert.strictEqual(wire.escrow_id, 'e-1')
  assert.strictEqual(wire.amount_raw, '5000000')
  assert.deepStrictEqual(wire.creator, creator)
})

test('toGigSummary: null accept_deadline survives (indefinitely-open gig)', () => {
  const wire = toGigSummary(gigRow({ accept_deadline: null }))
  assert.strictEqual(wire.accept_deadline, null)
})

test('toExchangeSummary: serializes dates, keeps numeric strings raw', () => {
  const row: ExchangeSummaryRow = {
    escrow_id: 'e-2',
    chain_id: 'solana:devnet',
    asset: 'SOL_DEVNET',
    amount_raw: '1000000000',
    status: 'open',
    fiat_amount: '150000.0000',
    fiat_currency: 'NGN',
    rate: '150000.0000000000',
    payment_window_seconds: 86_400,
    accept_deadline: null,
    created_at: CREATED,
    creator,
  }
  const wire = toExchangeSummary(row)
  assert.strictEqual(wire.created_at, CREATED.toISOString())
  assert.strictEqual(wire.accept_deadline, null)
  // numeric(20,4)/(30,10) stay strings — no float coercion on money.
  assert.strictEqual(wire.fiat_amount, '150000.0000')
  assert.strictEqual(wire.rate, '150000.0000000000')
})
