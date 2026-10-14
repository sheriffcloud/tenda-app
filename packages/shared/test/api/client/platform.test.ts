/**
 * platformApi / blockchainApi / uploadApi / moderationApi / reportsApi — verb,
 * route and payload per method.
 *
 * The two non-default timeouts are the point of the file beyond the table.
 * `permitPayload` reads name/nonces/DOMAIN_SEPARATOR off the token over RPC,
 * and `moderation.preview` waits on a content check; both would be aborted
 * mid-flight by the default budget, and the failure would look like a flaky
 * network rather than a timeout that was always going to fire.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import { createPlatformApi, createBlockchainApi, createUploadApi, createModerationApi, createReportsApi } from '../../../src/api/client/platform'
import { MODERATION_TIMEOUT_MS, TX_BUILD_TIMEOUT_MS } from '../../../src/api/client/timeouts'
import { apiConfig } from '../../../src/api/config'
import { assertLastCall, expectClientCall, recordingRequest, type ClientCase } from './harness'


const { request, calls } = recordingRequest()
const platformApi = createPlatformApi(request)
const blockchainApi = createBlockchainApi(request)
const uploadApi = createUploadApi(request)
const moderationApi = createModerationApi(request)
const reportsApi = createReportsApi(request)
const { platform, blockchain, upload, reports, moderation } = apiRoutes

const CASES: ClientCase[] = [
  { name: 'platform.config', call: () => platformApi.config(), method: 'GET', path: platform.config },
  {
    name: 'platform.exchangeRates',
    call: () => platformApi.exchangeRates(),
    method: 'GET',
    path: platform.exchangeRates,
  },
  { name: 'platform.chains', call: () => platformApi.chains(), method: 'GET', path: platform.chains },
  {
    name: 'blockchain.clientPing',
    call: () => blockchainApi.clientPing({ tx_ref: 'sig-1', action: 'create', chain_id: 'solana:devnet' }),
    method: 'POST',
    path: blockchain.clientPing,
    options: { body: { tx_ref: 'sig-1', action: 'create', chain_id: 'solana:devnet' } },
  },
  {
    name: 'upload.signature',
    call: () => uploadApi.signature({ type: 'avatar' }),
    method: 'POST',
    path: upload.signature,
    options: { body: { type: 'avatar' } },
  },
  {
    name: 'reports.create',
    call: () => reportsApi.create({ content_type: 'escrow', content_id: 'e1', reason: 'spam' }),
    method: 'POST',
    path: reports.create,
    options: { body: { content_type: 'escrow', content_id: 'e1', reason: 'spam' } },
  },
]

for (const testCase of CASES) {
  test(testCase.name, async () => {
    await expectClientCall(calls, testCase)
  })
}

test('permitPayload gets the RPC-aware build budget, not the default', async () => {
  const body = {
    chain_id: 'eip155:84532',
    asset: 'USDC_BASE',
    value_raw: '1000000',
    owner: '0xowner',
  }
  await blockchainApi.permitPayload(body)
  assertLastCall(calls, 'POST', blockchain.permitPayload, {
    body,
    timeout: TX_BUILD_TIMEOUT_MS,
  })
})

test('moderation preview gets the moderation budget, not the default', async () => {
  const body = {
    title: 'Deliver a parcel',
    description: 'Collect and deliver',
    category: 'delivery',
    country: 'NG',
    asset: 'USDC_SOL',
    amount_raw: '25000000',
    asset_decimals: 6,
  }
  await moderationApi.preview(body)
  assertLastCall(calls, 'POST', moderation.preview, {
    body,
    timeout: MODERATION_TIMEOUT_MS,
  })
})

test('every raised budget really is above the global request timeout', () => {
  // The whole reason timeouts.ts exists: "both raised above the global
  // apiConfig[env].timeout because the SERVER is slow on purpose for those
  // calls". A budget that slipped to or below the default would be an override
  // that overrides nothing, and the symptom is a raw "Aborted" with the wallet
  // never opening — which reads as a flaky network, not as a config mistake.
  //
  // They are all 20_000 TODAY. That is not asserted: they are separate
  // constants with separate reasons (an LLM round trip, an RPC read), and
  // pinning them equal would turn a coincidence into a contract.
  for (const env of ['development', 'staging', 'production'] as const) {
    assert.ok(MODERATION_TIMEOUT_MS > apiConfig[env].timeout, env)
    assert.ok(TX_BUILD_TIMEOUT_MS > apiConfig[env].timeout, env)
  }
})
