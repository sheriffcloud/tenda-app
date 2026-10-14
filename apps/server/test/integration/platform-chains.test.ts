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
import type { ChainRegistryEntry } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_ASSET,
  TEST_NATIVE_ASSET,
  useTestApp,
  buildTestApp,
  resetDb,
  FAKE_SOLANA_PROGRAM,
  FAKE_EVM_ESCROW,
  FAKE_APPROVAL_WINDOW_SECONDS,
  TEST_CHAIN_ID_ALT,
  TEST_ASSET_ALT,
  fakeRegistryPlus,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
/**
 * A MAINNET adapter alongside the two testnet fakes (#139). Both defaults are
 * testnets, so a route that hardcoded `network_kind: 'testnet'` passed every
 * assertion here — measured, mutation survived. The registry serves a chain
 * only when a DB row enables it, so registering the adapter changes nothing
 * for the suites above; the one test that inserts the row is the last.
 */
const MAINNET_CHAIN_ID = 'eip155:42220'
const getApp = useTestApp({ chains: fakeRegistryPlus(MAINNET_CHAIN_ID, 'eip155') })

/** An enabled EVM chain row — the tests below that insert one differ only in these four fields. */
function enabledEvmChainRow(id: string, display_name: string, min_confirmations: number, escrow_program = FAKE_EVM_ESCROW) {
  return {
    id,
    namespace: 'eip155' as const,
    display_name,
    min_confirmations,
    treasury_address: `0x${'aa'.repeat(20)}`,
    escrow_program,
    is_enabled: true,
  }
}

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
    // …but every Solana asset funds by signature: the creator signs the whole
    // transaction and the relayer only pays the fee (#146). The two flags are
    // different capabilities, which is exactly why both are published.
    funds_by_signature: true,
    // What the escrow validators will ACCEPT this asset for. USDC is the
    // chain's one gig asset and is exchange-tradable too.
    roles: ['gig', 'exchange'],
  })
  // Native gas asset carries a null token_address (not a contract).
  const native = data[0].assets.find((a: { id: string }) => a.id === TEST_NATIVE_ASSET)
  assert.strictEqual(native.token_address, null)
  assert.strictEqual(native.supports_permit, false)
  // Native SOL too: a signed transaction can move lamports as well as SPL.
  assert.strictEqual(native.funds_by_signature, true)
  // …and is exchange-only: posting a GIG in the native token is refused 422,
  // which is exactly what this field exists to say before the caller tries.
  assert.deepStrictEqual(native.roles, ['exchange'])
})

test('platform/chains: EVM USDC reads supports_permit from the manifest', { skip }, async () => {
  const app = getApp()
  // The alt chain is the one the fake registry has an EVM adapter for — the
  // route omits any chain it cannot transact on, so an arbitrary EVM id here
  // would drop out of the response entirely.
  const EVM_CHAIN = TEST_CHAIN_ID_ALT
  // Deliberately NOT the adapter's address: the column is not the source.
  await app.db.insert(chains).values(enabledEvmChainRow(EVM_CHAIN, '0G Galileo', 5, `0x${'ab'.repeat(20)}`))
  await app.db.insert(assets).values({
    id: TEST_ASSET_ALT,
    chain_id: EVM_CHAIN,
    symbol: 'USDC',
    decimals: 6,
    token_address: '0x3780460189622E60cB7ec6e8e97038A386674B71',
    is_stable: true,
    is_enabled: true,
  })
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    const evm = res.json().data.find((c: { id: string }) => c.id === EVM_CHAIN)
    assert.ok(evm, 'EVM chain should be served')
    assert.strictEqual(evm.escrow_address, FAKE_EVM_ESCROW)
    const usdc = evm.assets.find((a: { id: string }) => a.id === TEST_ASSET_ALT)
    // Manifest declares permit v2 for USDC_0G → capability true on the wire.
    assert.strictEqual(usdc.supports_permit, true)
    // …and EIP-3009 under that domain → it funds by signature (#146). Read
    // from the SAME predicate the relay refuses with, so this cannot advertise
    // what the relay denies. (This fixture seeds only USDC on the EVM chain;
    // the native-reads-false half is pinned on the predicate itself, in
    // shared's funds-by-signature.test.ts, over every EVM native asset.)
    assert.strictEqual(usdc.funds_by_signature, true)
  } finally {
    await app.db.delete(assets).where(eq(assets.id, TEST_ASSET_ALT))
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

/**
 * #132 / #137 — the registry says which listed chains the one-shot can FUND,
 * and where a testnet caller gets the money.
 *
 * The description used to say a chain appears only when the server "can settle
 * on it", and an external reviewer read that as "can relay on it", posted to
 * Celo Sepolia, got 503 RELAY_UNAVAILABLE, and had to GUESS a second chain.
 * The harness has exactly that shape: the Solana fake has no relay, the EVM
 * fake has one. So the two answers below are the two answers a deployment
 * gives, read from the same adapters the 503 is decided on.
 */
test('platform/chains: relayed_funding_available is the adapter\'s relay, per chain', { skip }, async () => {
  const app = getApp()
  await app.db.insert(chains).values(enabledEvmChainRow(TEST_CHAIN_ID_ALT, '0G Galileo', 1))
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    assert.strictEqual(res.statusCode, 200)
    const { data } = res.json<{ data: ChainRegistryEntry[] }>()
    const byId = new Map(data.map((c) => [c.id, c]))
    // The Solana fake: listed (a caller signing its own gas settles here) and
    // NOT relayable — exactly the chain the one-shot answers 503 on.
    assert.strictEqual(byId.get(TEST_CHAIN_ID)?.relayed_funding_available, false)
    // The EVM fake carries a relay, so this is the chain to choose.
    assert.strictEqual(byId.get(TEST_CHAIN_ID_ALT)?.relayed_funding_available, true)
    // The public facts come from the manifest, per chain: 0G Galileo publishes
    // an RPC and an explorer but NO faucet (its gig token is the repo mock with
    // an open mint()); a Solana cluster derives its RPC client-side and records
    // no explorer, and Circle serves devnet USDC.
    assert.strictEqual(byId.get(TEST_CHAIN_ID_ALT)?.rpc_url, 'https://evmrpc-testnet.0g.ai')
    assert.strictEqual(byId.get(TEST_CHAIN_ID_ALT)?.explorer_url, 'https://chainscan-galileo.0g.ai')
    assert.strictEqual(byId.get(TEST_CHAIN_ID_ALT)?.faucet_url, null)
    assert.strictEqual(byId.get(TEST_CHAIN_ID)?.rpc_url, null)
    assert.strictEqual(byId.get(TEST_CHAIN_ID)?.explorer_url, null)
    assert.strictEqual(byId.get(TEST_CHAIN_ID)?.faucet_url, 'https://faucet.circle.com')
  } finally {
    await app.db.delete(chains).where(eq(chains.id, TEST_CHAIN_ID_ALT))
  }
})

test('platform/chains: network_kind is the manifest\'s — a mainnet and a testnet answer differently', { skip }, async () => {
  // #139: the fact that lets a reader tell a null faucet_url on a mainnet from
  // one on a testnet whose mock has an open mint. Read from the manifest entry
  // the adapter was built from, so it cannot disagree with faucet_url — and
  // proven on BOTH kinds, because a hardcoded 'testnet' agrees with every
  // default harness chain.
  const app = getApp()
  // The extra adapter is APPENDED: the Solana fake must stay first, because
  // reconcile-escrows and the listeners plugin pick `list()[0]`.
  assert.strictEqual(app.chains.list()[0]?.chain_id, TEST_CHAIN_ID)
  await app.db.insert(chains).values(enabledEvmChainRow(MAINNET_CHAIN_ID, 'CELO', 3))
  try {
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    const { data } = res.json<{ data: ChainRegistryEntry[] }>()
    const byId = new Map(data.map((c) => [c.id, c]))
    const mainnet = byId.get(MAINNET_CHAIN_ID)
    const testnet = byId.get(TEST_CHAIN_ID)
    assert.ok(mainnet !== undefined && testnet !== undefined, 'both chains are served')
    assert.strictEqual(mainnet.network_kind, 'mainnet')
    assert.strictEqual(testnet.network_kind, 'testnet')
    // The two nulls the field exists to separate: real money on the mainnet…
    assert.strictEqual(mainnet.faucet_url, null)
    // …and a testnet that names where its USDC comes from.
    assert.notStrictEqual(testnet.faucet_url, null)
    // #148: the contract's review window rides on every entry, from the adapter
    // (the fake reports one value; the real ones read their contract).
    for (const chain of data) assert.strictEqual(chain.approval_window_seconds, FAKE_APPROVAL_WINDOW_SECONDS, chain.id)
  } finally {
    await app.db.delete(chains).where(eq(chains.id, MAINNET_CHAIN_ID))
  }
})

test('platform/chains: a chain whose contract never answers its review window is OMITTED, the others served', { skip }, async () => {
  // #148: never a 500 for the whole registry, never an entry that promises a
  // claim right this deployment cannot state. Its own app, because the omission
  // is an adapter property and the shared app's fakes all answer.
  const UNREADABLE = 'eip155:16602'
  const app = await buildTestApp({
    chains: fakeRegistryPlus(UNREADABLE, 'eip155', { approvalWindowSeconds: async () => { throw new Error('platform state not initialized') } }),
  })
  try {
    await resetDb(app)
    await app.db.insert(chains).values(enabledEvmChainRow(UNREADABLE, '0G Galileo', 1))
    const res = await app.inject({ method: 'GET', url: '/v1/platform/chains' })
    assert.strictEqual(res.statusCode, 200)
    const ids = res.json<{ data: ChainRegistryEntry[] }>().data.map((c) => c.id)
    assert.ok(ids.includes(TEST_CHAIN_ID), 'the readable chain is still served')
    assert.ok(!ids.includes(UNREADABLE), `the unreadable chain must not be advertised, got ${ids.join(',')}`)
  } finally {
    await app.close()
  }
})
