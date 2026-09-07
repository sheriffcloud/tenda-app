/**
 * features/fiat-rails/providers/licensed-http — the seams the main
 * fiat-rails suite leaves uncovered:
 *   - fetchProviderHttp: the production fetch wrapper (ok → json, non-2xx →
 *     502), post header/body merge + get
 *   - parseInstruction: bank_transfer (all fields + a missing one),
 *     deposit (memo present vs absent), redirect, unknown-kind throw
 *   - requireNumber: a present-but-non-number field → 502
 * Fully offline (fetch stubbed / fake ProviderHttp).
 */

import { test, afterEach } from 'node:test'
import * as assert from 'node:assert'
import {
  fetchProviderHttp,
  licensedHttpProvider,
  type LicensedProviderSpec,
  type ProviderHttp,
} from '@server/features/fiat-rails/providers/licensed-http'
import { AppError } from '@server/lib/errors'
import type { QuoteRequest } from '@server/features/fiat-rails/types'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const SPEC: LicensedProviderSpec = {
  id: 'test_prov',
  base_url: 'https://prov.test',
  capabilities: { onramp: true, offramp: true, currencies: ['NGN'], assets: ['USDC_SOL'] },
  paths: { quote: '/v1/quote', initiate: '/v1/initiate', status: '/v1/status/{ref}' },
}
const CREDS = { api_key: 'key', api_secret: 'secret' }

const QUOTE_REQ: QuoteRequest = {
  direction: 'onramp',
  user_id: 'u',
  fiat_currency: 'NGN',
  fiat_amount: 15_000,
  asset: 'USDC_SOL',
  asset_decimals: 6,
  asset_amount_raw: null,
  country: 'NG',
}

const INIT_INPUT = {
  quote_ref: 'q-1',
  user_id: 'u',
  wallet_address: 'W',
  direction: 'onramp' as const,
  quote: {
    fiat_currency: 'NGN',
    fiat_amount: 15_000,
    asset: 'USDC_SOL',
    asset_amount_raw: '9966666',
    rate: 1500,
  },
}

// ---------- fetchProviderHttp ------------------------------------------------

interface FetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

function stubFetch(resp: { ok?: boolean; status?: number; json?: () => Promise<unknown> }): {
  url: string
  init: FetchInit
}[] {
  const calls: { url: string; init: FetchInit }[] = []
  globalThis.fetch = (async (url: string, init?: FetchInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return {
      ok: resp.ok ?? true,
      status: resp.status ?? 200,
      json: resp.json ?? (async () => ({})),
    } as Response
  }) as typeof fetch
  return calls
}

test('fetchProviderHttp.post: ok returns json; merges content-type + custom headers + body', async () => {
  const calls = stubFetch({ json: async () => ({ a: 1 }) })
  const out = await fetchProviderHttp().post('https://x/y', { foo: 'bar' }, { 'X-Api-Key': 'k' })
  assert.deepStrictEqual(out, { a: 1 })
  assert.strictEqual(calls[0].init.method, 'POST')
  assert.strictEqual(calls[0].init.headers?.['content-type'], 'application/json')
  assert.strictEqual(calls[0].init.headers?.['X-Api-Key'], 'k')
  assert.strictEqual(calls[0].init.body, JSON.stringify({ foo: 'bar' }))
})

test('fetchProviderHttp.get: ok returns json; non-2xx → 502 PROVIDER_UNAVAILABLE', async () => {
  stubFetch({ json: async () => ({ status: 'completed' }) })
  assert.deepStrictEqual(await fetchProviderHttp().get('https://x', { h: '1' }), { status: 'completed' })

  stubFetch({ ok: false, status: 500 })
  await assert.rejects(
    () => fetchProviderHttp().post('https://x', {}, {}),
    (e: unknown) =>
      e instanceof AppError && e.statusCode === 502 && /responded 500/.test(e.message),
  )
})

// ---------- parseInstruction (via initiate) ----------------------------------

function providerReturning(instruction: unknown): ReturnType<typeof licensedHttpProvider> {
  const http: ProviderHttp = {
    async post(url) {
      if (url.endsWith(SPEC.paths.quote)) {
        return { quote_ref: 'q', rate: 1, fee_amount: 0, fiat_amount: 1, asset_amount_raw: '1' }
      }
      return { provider_ref: 'r', instruction }
    },
    async get() {
      return { status: 'completed' }
    },
  }
  return licensedHttpProvider(SPEC, CREDS, http)
}

test('initiate: bank_transfer maps every field', async () => {
  const p = providerReturning({
    kind: 'bank_transfer',
    bank_name: 'GTB',
    account_number: '0011223344',
    account_name: 'Tenda',
    narration: 'ref-9',
  })
  const r = await p.initiate(INIT_INPUT)
  assert.deepStrictEqual(r.instruction, {
    kind: 'bank_transfer',
    bank_name: 'GTB',
    account_number: '0011223344',
    account_name: 'Tenda',
    narration: 'ref-9',
  })
})

test('initiate: bank_transfer missing a required field → 502', async () => {
  const p = providerReturning({ kind: 'bank_transfer', bank_name: 'GTB' }) // missing the rest
  await assert.rejects(
    () => p.initiate(INIT_INPUT),
    (e: unknown) => e instanceof AppError && e.statusCode === 502,
  )
})

test('initiate: deposit preserves memo when present, null when absent', async () => {
  const withMemo = providerReturning({ kind: 'deposit', deposit_address: 'addr', memo: 'm1' })
  assert.deepStrictEqual((await withMemo.initiate(INIT_INPUT)).instruction, {
    deposit_address: 'addr',
    memo: 'm1',
  })

  const noMemo = providerReturning({ kind: 'deposit', deposit_address: 'addr' })
  assert.deepStrictEqual((await noMemo.initiate(INIT_INPUT)).instruction, {
    deposit_address: 'addr',
    memo: null,
  })
})

test('initiate: redirect + ussd map their fields; unknown kind → 502', async () => {
  const redirect = providerReturning({ kind: 'redirect', url: 'https://pay' })
  assert.deepStrictEqual((await redirect.initiate(INIT_INPUT)).instruction, {
    kind: 'redirect',
    url: 'https://pay',
  })

  const ussd = providerReturning({ kind: 'ussd', code: '*123*1#' })
  assert.deepStrictEqual((await ussd.initiate(INIT_INPUT)).instruction, {
    kind: 'ussd',
    code: '*123*1#',
  })

  const unknown = providerReturning({ kind: 'wormhole' })
  await assert.rejects(
    () => unknown.initiate(INIT_INPUT),
    (e: unknown) => e instanceof AppError && /unknown instruction kind/.test(e.message),
  )
})

// ---------- requireNumber error path -----------------------------------------

test('quote: a present-but-non-number rate → 502 (requireNumber)', async () => {
  const http: ProviderHttp = {
    async post() {
      return { quote_ref: 'q', rate: 'fifteen', fee_amount: 0, fiat_amount: 1, asset_amount_raw: '1' }
    },
    async get() {
      return {}
    },
  }
  const p = licensedHttpProvider(SPEC, CREDS, http)
  await assert.rejects(
    () => p.quote(QUOTE_REQ),
    (e: unknown) => e instanceof AppError && /missing 'rate'/.test(e.message),
  )
})
