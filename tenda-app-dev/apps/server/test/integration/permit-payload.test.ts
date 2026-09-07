/**
 * POST /v1/blockchain/permit-payload — HTTP surface negatives against the
 * real app (the harness registers a Solana-only fake adapter, so every case
 * here exercises validation and the PERMIT_UNAVAILABLE fallback signal; the
 * EVM happy path runs in the anvil lifecycle suite). Also covers the create
 * route's namespace guard: a permit body must never reach a non-EVM adapter.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  authHeader,
  createUser,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const PAYLOAD = {
  chain_id: TEST_CHAIN_ID,
  asset: 'USDC_SOL',
  value_raw: '1000000',
  owner: `0x${'aa'.repeat(20)}`,
}

test('permit-payload: requires auth', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'POST', url: '/v1/blockchain/permit-payload', payload: PAYLOAD })
  assert.strictEqual(res.statusCode, 401)
})

test('blockchain routes live at their shared-map paths (client-ping 404 regression)', { skip }, async () => {
  // Pre-fix, transaction.ts auto-loaded at the bare /v1/blockchain while the
  // shared routes map (and mobile) call /v1/blockchain/transaction — the
  // client-ping silently 404ed. 401 (not 404) proves the path exists.
  const app = getApp()
  const ping = await app.inject({ method: 'POST', url: '/v1/blockchain/transaction', payload: {} })
  assert.strictEqual(ping.statusCode, 401)
  const bare = await app.inject({ method: 'POST', url: '/v1/blockchain', payload: {} })
  assert.strictEqual(bare.statusCode, 404)
})

test('permit-payload: missing fields are 400s; unknown chain is a 422', { skip }, async () => {
  const app = getApp()
  const { token } = await createUser(app)
  for (const [field, expected] of [
    ['chain_id', 'chain_id is required'],
    ['asset', 'asset is required'],
    ['value_raw', 'value_raw is required'],
    ['owner', 'owner is required'],
  ] as const) {
    const body: Record<string, string> = { ...PAYLOAD }
    delete body[field]
    const res = await app.inject({
      method: 'POST',
      url: '/v1/blockchain/permit-payload',
      headers: authHeader(token),
      payload: body,
    })
    assert.strictEqual(res.statusCode, 400, field)
    assert.match(res.json().message, new RegExp(expected))
  }

  const unknown = await app.inject({
    method: 'POST',
    url: '/v1/blockchain/permit-payload',
    headers: authHeader(token),
    payload: { ...PAYLOAD, chain_id: 'eip155:1' },
  })
  assert.strictEqual(unknown.statusCode, 422)
  assert.match(unknown.json().message, /unsupported chain_id/)
})

test('permit-payload: a chain without permit support signals PERMIT_UNAVAILABLE', { skip }, async () => {
  const app = getApp()
  const { token } = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/blockchain/permit-payload',
    headers: authHeader(token),
    payload: PAYLOAD,
  })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, 'PERMIT_UNAVAILABLE')
})

test('create: a permit body on a non-EVM chain is rejected before the adapter', { skip }, async () => {
  const app = getApp()
  const { token } = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(token),
    payload: {
      kind: 'exchange',
      chain_id: TEST_CHAIN_ID,
      asset: 'SOL_DEVNET',
      amount_raw: '1000000000',
      accept_window_seconds: 24 * 3600,
      completion_duration_seconds: 7_200,
      permit: {
        value_raw: '1000000000',
        deadline_unix: Math.floor(Date.now() / 1000) + 600,
        signature: `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`,
      },
    },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /permit is not supported on/)
})
