/**
 * features/fiat-rails — quote→initiate→settle pipeline, provider routing
 * with fallback, p2p quoting math, webhook outcome mapping, licensed-http
 * adapter narrowing, reconcile + expire jobs. Fully offline via in-memory
 * store + fake providers.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  requestQuote,
  initiateIntent,
  cancelIntent,
  settleFromProvider,
  reconcileIntent,
  type FiatDeps,
  type FiatEvent,
} from '@server/features/fiat-rails/service'
import { pickCandidates, supportsRequest } from '@server/features/fiat-rails/routing'
import { inMemoryQuoteCache, type QuoteCache } from '@server/features/fiat-rails/quote-cache'
import { PAYOUT_CURRENCIES, CHAIN_MANIFEST, exchangeAssetsByChain, EXCHANGE_MAX_FIAT_AMOUNT, P2P_PROVIDER_ID } from '@tenda/shared'
import {
  p2pInternalProvider,
  type P2pFulfilment,
  type P2pOpenOffer,
} from '@server/features/fiat-rails/providers/p2p-internal'
import {
  licensedHttpProvider,
  type ProviderHttp,
} from '@server/features/fiat-rails/providers/licensed-http'
import { YELLOWCARD_SPEC } from '@server/features/fiat-rails/providers/specs'
import { mapWebhookOutcome } from '@server/features/fiat-rails/webhooks'
import { reconcileFiatIntentsHandler } from '@server/jobs/reconcile-fiat-intents'
import { expireFiatQuotesHandler } from '@server/jobs/expire-fiat-quotes'
import type {
  FiatProvider,
  FiatIntentRow,
  FiatIntentStatus,
  QuoteRequest,
} from '@server/features/fiat-rails/types'
import type { FiatStore, NewFiatIntent, IntentPatch } from '@server/features/fiat-rails/store'
import { AppError } from '@server/lib/errors'

const NOW = new Date('2026-06-01T12:00:00Z')

// ---------- fakes ---------------------------------------------------------

function memoryStore(): FiatStore & { rows: Map<string, FiatIntentRow> } {
  const rows = new Map<string, FiatIntentRow>()
  return {
    rows,
    async insertIntent(r: NewFiatIntent) {
      // Honour the explicit id (minted at quote time), mirroring the real
      // store — the intent_id must survive the quote → intent promotion.
      const row: FiatIntentRow = {
        ...r,
        created_at: NOW,
        updated_at: NOW,
      }
      rows.set(row.id, row)
      return row
    },
    async getIntent(id) {
      return rows.get(id) ?? null
    },
    async getIntentByProviderRef(provider, ref) {
      for (const r of rows.values()) {
        if (r.provider === provider && r.provider_ref === ref) return r
      }
      return null
    },
    async listIntentsByUser(user_id, limit) {
      return [...rows.values()].filter((r) => r.user_id === user_id).slice(0, limit)
    },
    async transition(id, from, patch: IntentPatch) {
      const row = rows.get(id)
      if (row === undefined || !from.includes(row.status)) return null
      const updated = { ...row, ...patch, updated_at: new Date(NOW.getTime() + 1) } as FiatIntentRow
      rows.set(id, updated)
      return updated
    },
    async listStaleOpen(olderThan, limit) {
      const open: FiatIntentStatus[] = ['awaiting_user', 'awaiting_provider', 'settling']
      return [...rows.values()]
        .filter((r) => open.includes(r.status) && r.updated_at < olderThan)
        .slice(0, limit)
    },
    async listExpiredAwaitingUser(now, limit) {
      return [...rows.values()]
        .filter(
          (r) =>
            r.status === 'awaiting_user' &&
            r.expires_at < now &&
            // Mirror the real store: an OPENED p2p offer is not quote-expired.
            r.provider !== P2P_PROVIDER_ID,
        )
        .slice(0, limit)
    },
  }
}

function fakeProvider(
  id: string,
  overrides: Partial<FiatProvider> = {},
): FiatProvider {
  return {
    id,
    capabilities: { onramp: true, offramp: true, currencies: ['NGN'], assets: ['USDC_SOL'] },
    async quote() {
      return {
        quote_ref: `${id}-q1`,
        rate: 1500,
        fee_amount: 100,
        fiat_amount: 15_000,
        asset_amount_raw: '9933333',
        kyc_required: false,
        kyc_url: null,
      }
    },
    async initiate() {
      return {
        provider_ref: `${id}-ref-1`,
        instruction: {
          kind: 'bank_transfer',
          bank_name: 'GTBank',
          account_number: '0123456789',
          account_name: 'Provider Ltd',
          narration: 'TENDA-1',
        },
        kyc_url: null,
      }
    },
    async status() {
      return 'pending'
    },
    ...overrides,
  }
}

function makeDeps(providers: FiatProvider[], registry?: Array<{ id: string; priority: number; is_enabled: boolean }>) {
  const store = memoryStore()
  // Behaviourally identical to the Redis cache, on the test's frozen clock so
  // TTL-expiry is deterministic.
  const cache: QuoteCache = inMemoryQuoteCache(() => NOW.getTime())
  const settled: FiatEvent[] = []
  const failed: Array<FiatEvent & { reason: string }> = []
  const warned: string[] = []
  const deps: FiatDeps = {
    store,
    quoteCache: cache,
    providers: new Map(providers.map((p) => [p.id, p])),
    registry: registry ?? providers.map((p, i) => ({ id: p.id, priority: i, is_enabled: true })),
    events: {
      settled: (e) => settled.push(e),
      failed: (e) => failed.push(e),
    },
    now: () => NOW,
    log: { warn: (_o, msg) => warned.push(msg) },
  }
  return { deps, store, cache, settled, failed, warned }
}

const ONRAMP_INPUT = {
  direction: 'onramp' as const,
  user_id: 'buyer-1',
  fiat_currency: 'NGN',
  fiat_amount: 15_000,
  asset: 'USDC_SOL',
  asset_decimals: 6,
  asset_amount_raw: null,
  country: 'NG',
  wallet_address: 'WALLET',
  chain_id: 'solana:devnet',
}

const OFFRAMP_INPUT = {
  ...ONRAMP_INPUT,
  direction: 'offramp' as const,
  fiat_amount: null,
  asset_amount_raw: '9933333',
}

// ---------- routing ---------------------------------------------------------

test('routing: priority order, capability + enabled filters, p2p appended last', () => {
  const a = fakeProvider('a')
  const b = fakeProvider('b')
  const offrampOnly = fakeProvider('c', {
    capabilities: { onramp: false, offramp: true, currencies: ['NGN'], assets: ['USDC_SOL'] },
  })
  const p2p = fakeProvider('p2p_internal', {
    capabilities: { onramp: true, offramp: true, currencies: ['NGN'], assets: ['*'] },
  })
  const providers = new Map([a, b, offrampOnly, p2p].map((p) => [p.id, p]))
  const registry = [
    { id: 'a', priority: 20, is_enabled: true },
    { id: 'b', priority: 10, is_enabled: true },
    { id: 'c', priority: 1, is_enabled: true },
    { id: 'p2p_internal', priority: 100, is_enabled: true },
  ]
  const req: QuoteRequest = { ...ONRAMP_INPUT }
  const picked = pickCandidates(registry, providers, req).map((p) => p.id)
  // c filtered (no onramp); b before a (priority); p2p appended last.
  assert.deepStrictEqual(picked, ['b', 'a', 'p2p_internal'])

  // Disabled licensed provider drops out; disabled p2p drops the fallback.
  const reg2 = registry.map((r) => (r.id === 'b' ? { ...r, is_enabled: false } : r))
  assert.deepStrictEqual(pickCandidates(reg2, providers, req).map((p) => p.id), ['a', 'p2p_internal'])
  const reg3 = registry.map((r) => (r.id === 'p2p_internal' ? { ...r, is_enabled: false } : r))
  assert.ok(!pickCandidates(reg3, providers, req).some((p) => p.id === 'p2p_internal'))
})

test('routing: unknown registry rows default licensed providers to disabled, p2p to enabled', () => {
  const a = fakeProvider('a')
  const p2p = fakeProvider('p2p_internal')
  const picked = pickCandidates([], new Map([[a.id, a], [p2p.id, p2p]]), { ...ONRAMP_INPUT })
  assert.deepStrictEqual(picked.map((p) => p.id), ['p2p_internal'])
})

test('supportsRequest: currency and asset filters, wildcard assets', () => {
  const p = fakeProvider('x', {
    capabilities: { onramp: true, offramp: false, currencies: ['NGN'], assets: ['*'] },
  })
  assert.strictEqual(supportsRequest(p, { ...ONRAMP_INPUT, asset: 'ANYTHING' }), true)
  assert.strictEqual(supportsRequest(p, { ...ONRAMP_INPUT, fiat_currency: 'KES' }), false)
  assert.strictEqual(supportsRequest(p, { ...ONRAMP_INPUT, direction: 'offramp' }), false)
})

test('launch capability matrix: p2p supports USDC+native across chains in NGN/KES/GHS, rejects off-launch', () => {
  // Mirror the live p2p_internal wiring (live-deps): PAYOUT_CURRENCIES + the
  // union of exchange-tradable assets. Locks the launch surface end-to-end.
  const exchangeAssets = [...new Set(CHAIN_MANIFEST.flatMap((c) => exchangeAssetsByChain(c.id)))]
  const p2p = fakeProvider('p2p', {
    capabilities: { onramp: true, offramp: true, currencies: PAYOUT_CURRENCIES, assets: exchangeAssets },
  })
  // USDC + natives, in each launch currency, both directions.
  for (const currency of ['NGN', 'KES', 'GHS']) {
    for (const asset of ['USDC_SOL', 'SOL_DEVNET', 'USDC_BASE', 'ETH_BASE', 'USDC_CELO', 'cUSD', 'CELO']) {
      for (const direction of ['onramp', 'offramp'] as const) {
        assert.strictEqual(
          supportsRequest(p2p, { ...ONRAMP_INPUT, direction, fiat_currency: currency, asset }),
          true,
          `${direction} ${asset}/${currency} should be supported`,
        )
      }
    }
  }
  // Off-launch currency (supported ISO but not a payout market) is rejected.
  assert.strictEqual(supportsRequest(p2p, { ...ONRAMP_INPUT, fiat_currency: 'USD', asset: 'USDC_SOL' }), false)
  // Gig-only / unregistered asset is rejected.
  assert.strictEqual(supportsRequest(p2p, { ...ONRAMP_INPUT, fiat_currency: 'NGN', asset: 'MYSTERY' }), false)
})

// ---------- quote ------------------------------------------------------------

test('requestQuote: caches the quote (NOT a Postgres row) with 10-min expiry', async () => {
  const { deps, store, cache } = makeDeps([fakeProvider('a')])
  const result = await requestQuote(deps, 'user-1', { ...ONRAMP_INPUT })
  assert.strictEqual(result.provider, 'a')
  // No durable row is created at quote time — it lives only in the cache.
  assert.strictEqual(store.rows.size, 0)
  const cached = await cache.peek(result.intent_id)
  assert.ok(cached)
  assert.strictEqual(cached.id, result.intent_id)
  assert.strictEqual(cached.user_id, 'user-1')
  assert.strictEqual(cached.fiat_amount, '15000.0000')
  assert.strictEqual(cached.quote_ref, 'a-q1')
  assert.strictEqual(new Date(result.expires_at).getTime(), NOW.getTime() + 10 * 60_000)
})

test('requestQuote: failing provider falls through to the next; all fail → 503', async () => {
  const broken = fakeProvider('broken', {
    async quote() {
      throw new Error('outage')
    },
  })
  const { deps, warned } = makeDeps([broken, fakeProvider('backup')])
  const result = await requestQuote(deps, 'user-1', { ...ONRAMP_INPUT })
  assert.strictEqual(result.provider, 'backup')
  assert.strictEqual(warned.length, 1)

  const { deps: deadDeps } = makeDeps([broken])
  await assert.rejects(
    requestQuote(deadDeps, 'user-1', { ...ONRAMP_INPUT }),
    (e: unknown) => e instanceof AppError && e.statusCode === 503,
  )
})

test('requestQuote: an over-max computed fiat_amount is a terminal 422, never persisted', async () => {
  const huge = fakeProvider('huge', {
    async quote() {
      return {
        quote_ref: 'huge-q', rate: 1, fee_amount: 0,
        fiat_amount: EXCHANGE_MAX_FIAT_AMOUNT + 1, // one past the numeric(20,4) rail
        asset_amount_raw: '1', kyc_required: false, kyc_url: null,
      }
    },
  })
  // A backup exists, but the bound is terminal — it must NOT fall through to it.
  const { deps, store, cache } = makeDeps([huge, fakeProvider('backup')])
  await assert.rejects(
    requestQuote(deps, 'user-1', { ...ONRAMP_INPUT }),
    (e: unknown) => e instanceof AppError && e.statusCode === 422 && /exceeds the maximum/.test(e.message),
  )
  assert.strictEqual(store.rows.size, 0, 'no intent may be persisted when the fiat bound is exceeded')
  assert.strictEqual(await cache.peek('huge-q'), null, 'no quote may be cached either')
})

test('requestQuote: no capable provider → 503', async () => {
  const { deps } = makeDeps([fakeProvider('a')])
  await assert.rejects(
    requestQuote(deps, 'user-1', { ...ONRAMP_INPUT, fiat_currency: 'KES' }),
    (e: unknown) => e instanceof AppError && e.statusCode === 503,
  )
})

// ---------- initiate ------------------------------------------------------------

async function quotedIntent(deps: FiatDeps, user = 'user-1') {
  const q = await requestQuote(deps, user, { ...ONRAMP_INPUT })
  return q.intent_id
}

test('initiate: transitions to awaiting_user, persists instruction + provider_ref', async () => {
  const { deps, store } = makeDeps([fakeProvider('a')])
  const intent_id = await quotedIntent(deps)
  const out = await initiateIntent(deps, 'user-1', intent_id, {})
  assert.strictEqual(out.status, 'awaiting_user')
  assert.strictEqual(out.instruction !== null && 'kind' in out.instruction && out.instruction.kind, 'bank_transfer')
  const row = store.rows.get(intent_id)
  assert.ok(row)
  assert.strictEqual(row.provider_ref, 'a-ref-1')
  const meta = row.metadata as { instruction: { kind: string } }
  assert.strictEqual(meta.instruction.kind, 'bank_transfer')
})

test('initiate: KYC url parks the intent on awaiting_provider', async () => {
  const kyc = fakeProvider('a', {
    async initiate() {
      return {
        provider_ref: 'a-ref-2',
        instruction: { kind: 'redirect', url: 'https://kyc.example' },
        kyc_url: 'https://kyc.example',
      }
    },
  })
  const { deps } = makeDeps([kyc])
  const intent_id = await quotedIntent(deps)
  const out = await initiateIntent(deps, 'user-1', intent_id, {})
  assert.strictEqual(out.status, 'awaiting_provider')
  assert.strictEqual(out.kyc_url, 'https://kyc.example')
})

test('initiate guards: a wrong-owner peek is 404 and does NOT burn the quote', async () => {
  const { deps, cache } = makeDeps([fakeProvider('a')])
  const intent_id = await quotedIntent(deps)
  await assert.rejects(
    initiateIntent(deps, 'someone-else', intent_id, {}),
    (e: unknown) => e instanceof AppError && e.statusCode === 404,
  )
  // The failed ownership guard peeked, never took — the quote survives.
  assert.ok(await cache.peek(intent_id), 'quote must survive a failed guard')
  await initiateIntent(deps, 'user-1', intent_id, {})
  // Second initiate: quote consumed, committed row exists → already-initiated 409.
  await assert.rejects(
    initiateIntent(deps, 'user-1', intent_id, {}),
    (e: unknown) => e instanceof AppError && e.statusCode === 409,
  )
})

test('initiate: a consumed/expired quote → 410, no row created', async () => {
  const { deps, store, cache } = makeDeps([fakeProvider('a')])
  const intent_id = await quotedIntent(deps)
  await cache.take(intent_id) // simulate TTL-eviction / prior consumption
  await assert.rejects(
    initiateIntent(deps, 'user-1', intent_id, {}),
    (e: unknown) => e instanceof AppError && e.statusCode === 410,
  )
  assert.strictEqual(store.rows.size, 0, 'a gone quote never yields a committed row')
})

test('initiate offramp guards: direction, payout currency, missing bank — none burn the quote', async () => {
  const { deps } = makeDeps([fakeProvider('a')])
  const BANK = { bank_code: '058', account_number: '0123456789', account_name: 'Seller' }
  const intent_id = (await requestQuote(deps, 'user-1', { ...OFFRAMP_INPUT })).intent_id

  // Wrong expected direction.
  await assert.rejects(
    initiateIntent(deps, 'user-1', intent_id, { expected_direction: 'onramp' }),
    (e: unknown) => e instanceof AppError && e.statusCode === 422 && /not an onramp/.test(e.message),
  )
  // Payout account currency (KE → KES) ≠ the quote's NGN.
  await assert.rejects(
    initiateIntent(deps, 'user-1', intent_id, { expected_direction: 'offramp', payout_country: 'KE', bank_account: BANK }),
    (e: unknown) => e instanceof AppError && e.statusCode === 422 && /currency/.test(e.message),
  )
  // Offramp needs a bank account.
  await assert.rejects(
    initiateIntent(deps, 'user-1', intent_id, { expected_direction: 'offramp' }),
    (e: unknown) => e instanceof AppError && e.statusCode === 422 && /bank_account/.test(e.message),
  )
  // Proves the three failed guards left the quote intact.
  const out = await initiateIntent(deps, 'user-1', intent_id, {
    expected_direction: 'offramp',
    payout_country: 'NG',
    bank_account: BANK,
  })
  assert.strictEqual(out.status, 'awaiting_user')
})

// ---------- cancel ----------------------------------------------------------------

test('cancel: drops a pre-commit quote (no row); cancels awaiting_user; rejects settling', async () => {
  const { deps, store, cache } = makeDeps([fakeProvider('a')])

  // A pre-commit quote: cancel just drops it from the cache, nothing persisted.
  const quote_id = await quotedIntent(deps)
  await cancelIntent(deps, 'user-1', quote_id)
  assert.strictEqual(await cache.peek(quote_id), null)
  assert.strictEqual(store.rows.size, 0)

  // A committed awaiting_user intent cancels via the status-guarded transition.
  const active = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', active, {})
  await cancelIntent(deps, 'user-1', active)
  assert.strictEqual(store.rows.get(active)?.status, 'cancelled')

  // settling is in-flight → not unilaterally cancellable.
  const third = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', third, {})
  const row = store.rows.get(third)
  assert.ok(row)
  store.rows.set(third, { ...row, status: 'settling' })
  await assert.rejects(
    cancelIntent(deps, 'user-1', third),
    (e: unknown) => e instanceof AppError && e.statusCode === 409,
  )
})

test('cancel: a wrong-owner quote is 404 and is NOT dropped', async () => {
  const { deps, cache } = makeDeps([fakeProvider('a')])
  const quote_id = await quotedIntent(deps)
  await assert.rejects(
    cancelIntent(deps, 'someone-else', quote_id),
    (e: unknown) => e instanceof AppError && e.statusCode === 404,
  )
  assert.ok(await cache.peek(quote_id), 'a foreign cancel must not drop the owner’s quote')
})

test('cancel: a foreign user cannot cancel a committed awaiting_user intent (IDOR guard)', async () => {
  const { deps, store } = makeDeps([fakeProvider('a')])
  const intent_id = await quotedIntent(deps, 'owner-1')
  await initiateIntent(deps, 'owner-1', intent_id, {})
  await assert.rejects(
    cancelIntent(deps, 'attacker', intent_id),
    (e: unknown) => e instanceof AppError && e.statusCode === 404,
  )
  assert.strictEqual(store.rows.get(intent_id)?.status, 'awaiting_user', 'must NOT be cancelled')
})

// ---------- settlement ----------------------------------------------------------------

test('settleFromProvider: completed → settled + event; replay is idempotent', async () => {
  const { deps, store, settled } = makeDeps([fakeProvider('a')])
  const intent_id = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', intent_id, {})

  const first = await settleFromProvider(deps, { provider: 'a', provider_ref: 'a-ref-1', outcome: 'completed' })
  assert.strictEqual(first?.status, 'settled')
  assert.strictEqual(settled.length, 1)
  assert.strictEqual(settled[0].intent_id, intent_id)

  const replay = await settleFromProvider(deps, { provider: 'a', provider_ref: 'a-ref-1', outcome: 'completed' })
  assert.strictEqual(replay?.status, 'settled')
  assert.strictEqual(settled.length, 1) // no double fan-out
  assert.strictEqual(store.rows.get(intent_id)?.status, 'settled')
})

test('settleFromProvider: failed outcome emits reasoned failure; unknown ref dropped with warn', async () => {
  const { deps, failed, warned } = makeDeps([fakeProvider('a')])
  const intent_id = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', intent_id, {})

  await settleFromProvider(deps, { provider: 'a', provider_ref: 'a-ref-1', outcome: 'failed', reason: 'declined' })
  assert.strictEqual(failed.length, 1)
  assert.strictEqual(failed[0].reason, 'declined')

  const ghost = await settleFromProvider(deps, { provider: 'a', provider_ref: 'nope', outcome: 'completed' })
  assert.strictEqual(ghost, null)
  assert.ok(warned.some((m) => m.includes('unknown provider_ref')))
})

// ---------- reconcile -------------------------------------------------------------------

test('reconcileIntent: provider completed converges; pending no-op; young not_found waits', async () => {
  const states: Record<string, 'pending' | 'completed' | 'failed' | 'not_found'> = {}
  const probe = fakeProvider('a', {
    async status(ref) {
      return states[ref] ?? 'pending'
    },
  })
  const { deps, store, settled } = makeDeps([probe])
  const intent_id = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', intent_id, {})
  const row = () => store.rows.get(intent_id)

  states['a-ref-1'] = 'pending'
  await reconcileIntent(deps, row()!)
  assert.strictEqual(row()?.status, 'awaiting_user')

  states['a-ref-1'] = 'not_found' // young — provider lag, keep waiting
  await reconcileIntent(deps, row()!)
  assert.strictEqual(row()?.status, 'awaiting_user')

  states['a-ref-1'] = 'completed'
  await reconcileIntent(deps, row()!)
  assert.strictEqual(row()?.status, 'settled')
  assert.strictEqual(settled.length, 1)
})

test('reconcileIntent: not_found past 24h fails the intent', async () => {
  const probe = fakeProvider('a', {
    async status() {
      return 'not_found'
    },
  })
  const { deps, store, failed } = makeDeps([probe])
  const intent_id = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', intent_id, {})
  const row = store.rows.get(intent_id)
  assert.ok(row)
  store.rows.set(intent_id, { ...row, created_at: new Date(NOW.getTime() - 25 * 3_600_000) })

  await reconcileIntent(deps, store.rows.get(intent_id)!)
  assert.strictEqual(store.rows.get(intent_id)?.status, 'failed')
  assert.ok(failed[0].reason.includes('no record'))
})

test('reconcile job: scans stale opens, isolates per-intent provider errors', async () => {
  const moody = fakeProvider('a', {
    async status(ref) {
      if (ref === 'a-ref-1') throw new Error('flaky')
      return 'pending'
    },
  })
  const { deps, store, warned } = makeDeps([moody])
  const intent_id = await quotedIntent(deps)
  await initiateIntent(deps, 'user-1', intent_id, {})
  // Make it stale.
  const row = store.rows.get(intent_id)
  assert.ok(row)
  store.rows.set(intent_id, { ...row, updated_at: new Date(NOW.getTime() - 6 * 60_000) })

  const result = await reconcileFiatIntentsHandler(deps)
  assert.strictEqual(result.scanned, 1)
  assert.ok(warned.some((m) => m.includes('status poll failed')))
})

// ---------- expire job ---------------------------------------------------------------------

test('expire job: fails stale awaiting_user (licensed) + notifies; skips opened p2p offers', async () => {
  const { deps, store, failed } = makeDeps([fakeProvider('a')])
  const past = new Date(NOW.getTime() - 1)
  const base = {
    direction: 'offramp' as const,
    user_id: 'u',
    wallet_address: 'W',
    chain_id: 'solana:devnet',
    fiat_currency: 'NGN',
    fiat_amount: '15000.0000',
    asset: 'USDC_SOL',
    asset_amount_raw: '9933333',
    rate: '1500.0000000000',
    fee_amount: '0.0000',
    status: 'awaiting_user' as const,
    kyc_required: false,
    kyc_url: null,
    metadata: {},
  }
  // Licensed deposit instruction past its quote window → expires + notifies.
  await store.insertIntent({ ...base, id: 'lic-1', provider: 'a', provider_ref: 'a-ref-1', expires_at: past })
  // An OPENED p2p offer is governed by its own accept_deadline, NOT this window.
  await store.insertIntent({ ...base, id: 'p2p-1', provider: P2P_PROVIDER_ID, provider_ref: 'offer-1', expires_at: past })

  const result = await expireFiatQuotesHandler(deps)
  assert.strictEqual(result.expired, 1)
  assert.strictEqual(store.rows.get('lic-1')?.status, 'failed')
  assert.strictEqual(store.rows.get('p2p-1')?.status, 'awaiting_user')
  assert.strictEqual(failed.length, 1)
  assert.strictEqual(failed[0].intent_id, 'lic-1')
  assert.strictEqual(failed[0].reason, 'quote expired')

  // Second run: nothing left to expire.
  const again = await expireFiatQuotesHandler(deps)
  assert.strictEqual(again.expired, 0)
})

// ---------- p2p provider ----------------------------------------------------------------------

function p2p(
  overrides: Partial<{ mid: number; fulfilment: P2pFulfilment; offer: P2pOpenOffer | null }> = {},
) {
  const opened: unknown[] = []
  const fulfilment: P2pFulfilment = overrides.fulfilment ?? {
    async open(input) {
      opened.push(input)
      return { offer_id: 'offer-1' }
    },
    async status() {
      return 'pending'
    },
  }
  const provider = p2pInternalProvider({
    rates: { midRate: async () => overrides.mid ?? 1500 },
    book: { bestMatch: async () => overrides.offer ?? null },
    fulfilment,
    capabilities: { onramp: true, offramp: true, currencies: ['NGN'], assets: ['SOL', 'SOL_DEVNET'] },
    now: () => NOW,
  })
  return { provider, opened }
}

const OPEN_OFFER: P2pOpenOffer = {
  offer_id: 'offer-live',
  fiat_amount: 10_000,
  asset_amount_raw: '6500000000',
  rate: 1538.46,
}

test('p2p quote: onramp returns the matched offer terms; no match -> 503', async () => {
  const { provider } = p2p({ offer: OPEN_OFFER })
  const on = await provider.quote({ ...ONRAMP_INPUT, asset: 'SOL_DEVNET', asset_decimals: 9, fiat_amount: 10_100 })
  // The quote IS the offer — ref, rate and both amounts come from the book.
  assert.strictEqual(on.quote_ref, 'offer-live')
  assert.strictEqual(on.rate, OPEN_OFFER.rate)
  assert.strictEqual(on.fiat_amount, OPEN_OFFER.fiat_amount)
  assert.strictEqual(on.asset_amount_raw, OPEN_OFFER.asset_amount_raw)

  const { provider: dryBook } = p2p({ offer: null })
  await assert.rejects(
    dryBook.quote({ ...ONRAMP_INPUT, asset: 'SOL_DEVNET', asset_decimals: 9 }),
    (e: unknown) => e instanceof AppError && e.statusCode === 503,
  )
})

test('p2p quote: offramp marks the mid-rate down by the spread', async () => {
  const { provider } = p2p({ mid: 1000 })
  const off = await provider.quote({
    ...ONRAMP_INPUT,
    direction: 'offramp',
    asset: 'SOL_DEVNET',
    asset_decimals: 9,
    fiat_amount: null,
    asset_amount_raw: '2000000000',
  })
  assert.strictEqual(off.rate, 990) // -100bps
  assert.strictEqual(off.fiat_amount, 1980)
})

test('p2p quote: offramp handles an 18-decimal asset (ETH) via BigInt-exact conversion', async () => {
  // 1.5 ETH at 18 dp — the base-unit count (1.5e18) exceeds 2^53, so the raw→
  // display step must not go through float Number(raw)/10**decimals.
  const { provider } = p2p({ mid: 2000 })
  const off = await provider.quote({
    ...ONRAMP_INPUT,
    direction: 'offramp',
    asset: 'ETH_BASE',
    asset_decimals: 18,
    fiat_amount: null,
    asset_amount_raw: '1500000000000000000',
  })
  assert.strictEqual(off.rate, 1980) // 2000 − 100bps
  assert.strictEqual(off.fiat_amount, 2970) // 1.5 × 1980
})

test('p2p quote validation: onramp needs fiat_amount, offramp needs asset_amount_raw', async () => {
  const { provider } = p2p()
  await assert.rejects(
    provider.quote({ ...ONRAMP_INPUT, asset: 'SOL_DEVNET', fiat_amount: null }),
    (e: unknown) => e instanceof AppError && e.statusCode === 422,
  )
  await assert.rejects(
    provider.quote({
      ...ONRAMP_INPUT,
      direction: 'offramp',
      asset: 'SOL_DEVNET',
      fiat_amount: null,
      asset_amount_raw: null,
    }),
    (e: unknown) => e instanceof AppError && e.statusCode === 422,
  )
})

test('p2p initiate: stateless — opens the exchange leg from the supplied quote snapshot', async () => {
  const { provider, opened } = p2p({ offer: OPEN_OFFER })
  const q = await provider.quote({ ...ONRAMP_INPUT, asset: 'SOL_DEVNET', asset_decimals: 9 })
  // Fresh instance (deps rebuilt per request) — must still initiate fine.
  const { provider: fresh, opened: freshOpened } = p2p()
  const init = await fresh.initiate({
    quote_ref: q.quote_ref,
    user_id: 'user-1',
    wallet_address: 'W',
    direction: 'onramp',
    quote: {
      fiat_currency: 'NGN',
      fiat_amount: q.fiat_amount,
      asset: 'SOL_DEVNET',
      asset_amount_raw: q.asset_amount_raw,
      rate: q.rate,
    },
  })
  assert.deepStrictEqual(init.instruction, { kind: 'p2p', offer_id: 'offer-1' })
  assert.strictEqual(opened.length, 0) // first instance unused
  assert.strictEqual(freshOpened.length, 1)
  // Onramp threads the matched offer through quote_ref -> offer_ref.
  assert.strictEqual((freshOpened[0] as { offer_ref?: string }).offer_ref, q.quote_ref)
})

// ---------- licensed-http adapter ------------------------------------------------------------------

test('licensed-http: signs requests, narrows responses, maps statuses', async () => {
  const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = []
  const http: ProviderHttp = {
    async post(url, body, headers) {
      calls.push({ url, body, headers })
      if (url.endsWith(YELLOWCARD_SPEC.paths.quote)) {
        return {
          quote_ref: 'q-1',
          rate: 1500,
          fee_amount: 50,
          fiat_amount: 15_000,
          asset_amount_raw: '9966666',
          kyc_required: true,
          kyc_url: 'https://kyc',
        }
      }
      return {
        provider_ref: 'yc-1',
        instruction: { kind: 'ussd', code: '*737*1#' },
      }
    },
    async get(url, headers) {
      calls.push({ url, body: undefined, headers })
      return { status: 'processing' }
    },
  }
  const provider = licensedHttpProvider(
    YELLOWCARD_SPEC,
    { api_key: 'key', api_secret: 'secret' },
    http,
  )
  const quote = await provider.quote({ ...ONRAMP_INPUT })
  assert.strictEqual(quote.kyc_required, true)
  assert.strictEqual(quote.kyc_url, 'https://kyc')
  assert.strictEqual(calls[0].headers['X-Api-Key'], 'key')
  assert.match(calls[0].headers['X-Signature'], /^[0-9a-f]{64}$/)

  const init = await provider.initiate({
    quote_ref: 'q-1',
    user_id: 'u',
    wallet_address: 'W',
    direction: 'onramp',
    quote: { fiat_currency: 'NGN', fiat_amount: 15_000, asset: 'USDC_SOL', asset_amount_raw: '9966666', rate: 1500 },
  })
  assert.deepStrictEqual(init.instruction, { kind: 'ussd', code: '*737*1#' })

  assert.strictEqual(await provider.status('yc-1'), 'pending') // 'processing' maps to pending
  assert.ok(calls[2].url.includes('yc-1'))
})

test('licensed-http: malformed responses → 502 PROVIDER_UNAVAILABLE', async () => {
  const http: ProviderHttp = {
    async post() {
      return { rate: 1500 } // missing quote_ref etc.
    },
    async get() {
      return {}
    },
  }
  const provider = licensedHttpProvider(YELLOWCARD_SPEC, { api_key: 'k', api_secret: 's' }, http)
  await assert.rejects(
    provider.quote({ ...ONRAMP_INPUT }),
    (e: unknown) => e instanceof AppError && e.statusCode === 502,
  )
  // Unknown status string degrades to 'pending', never throws.
  assert.strictEqual(await provider.status('x'), 'pending')
})

// ---------- webhook outcome mapping -----------------------------------------------------------------

test('mapWebhookOutcome: terminal statuses map, phase updates return null', () => {
  assert.strictEqual(mapWebhookOutcome('completed'), 'completed')
  assert.strictEqual(mapWebhookOutcome('success'), 'completed')
  assert.strictEqual(mapWebhookOutcome('failed'), 'failed')
  assert.strictEqual(mapWebhookOutcome('cancelled'), 'failed')
  assert.strictEqual(mapWebhookOutcome('declined'), 'failed')
  assert.strictEqual(mapWebhookOutcome('processing'), null)
  assert.strictEqual(mapWebhookOutcome(undefined), null)
})
