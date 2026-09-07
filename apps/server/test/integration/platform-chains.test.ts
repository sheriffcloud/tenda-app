/**
 * CO5 (#74): GET /v1/platform/chains — the chain/asset picker source.
 * Enabled chains carry their enabled assets; disabled rows never surface.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { assets, chains } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_ASSET,
  TEST_NATIVE_ASSET,
  useTestApp,
  FAKE_SOLANA_PROGRAM,
  FAKE_EVM_ESCROW,
  TEST_CHAIN_ID_ALT,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('platform/chains: enabled chains with their enabled assets', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
  assert.strictEqual(res.statusCode, 200)
  const { data } = res.json()
  assert.strictEqual(data.length, 1)
  assert.strictEqual(data[0].id, TEST_CHAIN_ID)
  assert.strictEqual(data[0].namespace, 'solana')
  assert.deepStrictEqual(
    data[0].assets.map((a: { id: string }) => a.id).sort(),
    [TEST_NATIVE_ASSET, TEST_ASSET].sort(),
  )
  // escrow_address is the client-side approve/permit spender, sourced from the
  // ADAPTER (see the drift test below).
  assert.strictEqual(data[0].escrow_address, FAKE_SOLANA_PROGRAM)
  const usdc = data[0].assets.find((a: { id: string }) => a.id === TEST_ASSET)
  // token_address is the single source the mobile balance reader consumes.
  assert.deepStrictEqual(usdc, {
    id: TEST_ASSET,
    symbol: 'USDC',
    decimals: 6,
    is_stable: true,
    token_address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    // Solana has no EIP-2612 — capability must read false despite USDC.
    supports_permit: false,
  })
  // Native gas asset carries a null token_address (not a contract).
  const native = data[0].assets.find((a: { id: string }) => a.id === TEST_NATIVE_ASSET)
  assert.strictEqual(native.token_address, null)
  assert.strictEqual(native.supports_permit, false)
})

test('platform/chains: EVM USDC reads supports_permit from the manifest', { skip }, async () => {
  const app = getApp()
  // The alt chain is the one the fake registry has an EVM adapter for — the
  // route omits any chain it cannot transact on, so an arbitrary EVM id here
  // would drop out of the response entirely.
  const EVM_CHAIN = TEST_CHAIN_ID_ALT
  await app.db.insert(chains).values({
    id: EVM_CHAIN,
    namespace: 'eip155',
    display_name: 'Base Sepolia',
    min_confirmations: 5,
    treasury_address: `0x${'aa'.repeat(20)}`,
    // Deliberately NOT the adapter's address: the column is not the source.
    escrow_program: `0x${'ab'.repeat(20)}`,
    is_enabled: true,
  })
  await app.db.insert(assets).values({
    id: 'USDC_BASE',
    chain_id: EVM_CHAIN,
    symbol: 'USDC',
    decimals: 6,
    token_address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    is_stable: true,
    is_enabled: true,
  })
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    const evm = res.json().data.find((c: { id: string }) => c.id === EVM_CHAIN)
    assert.ok(evm, 'EVM chain should be served')
    assert.strictEqual(evm.escrow_address, FAKE_EVM_ESCROW)
    const usdc = evm.assets.find((a: { id: string }) => a.id === 'USDC_BASE')
    // Manifest declares permit v2 for USDC_BASE → capability true on the wire.
    assert.strictEqual(usdc.supports_permit, true)
  } finally {
    await app.db.delete(assets).where(eq(assets.id, 'USDC_BASE'))
    await app.db.delete(chains).where(eq(chains.id, EVM_CHAIN))
  }
})

test('platform/chains: disabled assets and chains drop out', { skip }, async () => {
  const app = getApp()
  await app.db.update(assets).set({ is_enabled: false }).where(eq(assets.id, TEST_NATIVE_ASSET))
  const partial = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
  assert.deepStrictEqual(
    partial.json().data[0].assets.map((a: { id: string }) => a.id),
    [TEST_ASSET],
  )

  await app.db.update(chains).set({ is_enabled: false }).where(eq(chains.id, TEST_CHAIN_ID))
  const none = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
  assert.deepStrictEqual(none.json().data, [])
})

test('platform/chains: escrow_address comes from the ADAPTER, not the stale DB column', { skip }, async () => {
  // The bug this closes (2026-07-27): `chains.escrow_program` is written only
  // by `db:seed`, so after a contract redeploy it sat two generations behind on
  // both EVM testnets — and it was what this route served. The server never
  // reads that column, so nothing failed server-side while mobile was handed a
  // dead address and signed transactions against a contract that no longer
  // existed.
  const app = getApp()
  const rows = await app.db
    .select({ escrow_program: chains.escrow_program })
    .from(chains)
    .where(eq(chains.id, TEST_CHAIN_ID))
  const original = rows[0]?.escrow_program ?? ''

  await app.db
    .update(chains)
    .set({ escrow_program: 'StaleProgram1111111111111111111111111111111' })
    .where(eq(chains.id, TEST_CHAIN_ID))
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    const chain = res.json().data.find((c: { id: string }) => c.id === TEST_CHAIN_ID)
    assert.strictEqual(
      chain.escrow_address,
      FAKE_SOLANA_PROGRAM,
      'must serve the adapter address even when the seeded column disagrees',
    )
    assert.notStrictEqual(chain.escrow_address, 'StaleProgram1111111111111111111111111111111')
  } finally {
    await app.db.update(chains).set({ escrow_program: original }).where(eq(chains.id, TEST_CHAIN_ID))
  }
})

test('platform/chains: a chain with no adapter is omitted, not advertised', { skip }, async () => {
  // An enabled row the server cannot transact on is a dead end for the client:
  // every create/accept against it would fail "no adapter registered".
  const app = getApp()
  const ORPHAN = 'solana:mainnet'
  await app.db.insert(chains).values({
    id: ORPHAN,
    namespace: 'solana',
    display_name: 'Solana Mainnet',
    min_confirmations: 32,
    treasury_address: 'Cb34YD7SrANtCMy4t8Aqz6rYFdDmWPEKGe725sTdJEQZ',
    escrow_program: '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes',
    is_enabled: true,
  })
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    const ids = res.json().data.map((c: { id: string }) => c.id)
    assert.ok(!ids.includes(ORPHAN), `unconfigured chain must not be served, got ${ids.join(',')}`)
  } finally {
    await app.db.delete(chains).where(eq(chains.id, ORPHAN))
  }
})
