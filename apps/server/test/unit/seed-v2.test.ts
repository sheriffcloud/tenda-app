/**
 * db/seed-v2 — pure row builder over the ACTIVE chain secrets + the shared
 * manifest; the row VALUES are what need guarding here. The I/O wrapper
 * (applySeed — registry-fact upserts + enablement reconcile) is DB-tested in
 * integration/seed-upsert.test.ts. Secrets are built through the real loader.
 * Partial / malformed config is rejected upstream by the loader (see
 * secrets.test), so the seeder only ever sees clean, active chains.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { ESCROW_IDL } from '@tenda/shared/idl'
import { buildSeedRows, enablementDelta } from '@server/db/seed-v2'
import { gasSeedAddressFromSecret } from '@server/chains/solana/gas-seed-sender'
import { loadChainSecrets } from '@server/chains/secrets'

const SOL = 'So11111111111111111111111111111111111111112'
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // canonical USDC mint shape
const EVM_ESCROW = '0x00000000000000000000000000000000000000e5'
const EVM_TREASURY = '0x00000000000000000000000000000000000000a1'
const RPC = 'https://rpc.example'

const solDevnet = (extra: NodeJS.ProcessEnv = {}) =>
  loadChainSecrets({ CHAIN_SOLANA_DEVNET_RPC_URL: RPC, CHAIN_SOLANA_DEVNET_TREASURY_ADDR: SOL, ...extra })
const baseMainnet = () =>
  loadChainSecrets({
    CHAIN_EIP155_8453_RPC_URL: RPC,
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM_ESCROW,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM_TREASURY,
  })
const celoMainnet = () =>
  loadChainSecrets({
    CHAIN_EIP155_42220_RPC_URL: RPC,
    CHAIN_EIP155_42220_ESCROW_ADDR: EVM_ESCROW,
    CHAIN_EIP155_42220_TREASURY_ADDR: EVM_TREASURY,
  })

test('seeds only the active solana chain — IDL program id + configured treasury', () => {
  const rows = buildSeedRows(solDevnet({ CHAIN_SOLANA_DEVNET_USDC_MINT: MINT }))
  assert.deepStrictEqual(
    rows.chains.map((c) => c.id),
    ['solana:devnet'],
  )
  const c = rows.chains[0]
  assert.ok(c)
  assert.strictEqual(c.escrow_program, ESCROW_IDL.address)
  assert.strictEqual(c.treasury_address, SOL)
  assert.strictEqual(c.min_confirmations, 1)
  // The manifest declares a seed amount, but with no hot-wallet key configured
  // the pair stays NULL (both-or-neither CHECK) — the chain's seed is dormant.
  assert.strictEqual(c.gas_seed_amount_raw, null)
  assert.strictEqual(c.gas_seed_wallet_address, null)
})

test('gas-seed pair populates from the manifest amount + derived funder when the key is set', () => {
  const kp = Keypair.generate()
  const key = bs58.encode(kp.secretKey)
  const rows = buildSeedRows(
    solDevnet({ CHAIN_SOLANA_DEVNET_USDC_MINT: MINT, CHAIN_SOLANA_DEVNET_GAS_SEED_KEY: key }),
  )
  const c = rows.chains[0]
  assert.ok(c)
  assert.strictEqual(c.gas_seed_amount_raw, '7000000')
  // Funder address is DERIVED from the same secret the sender signs with — never
  // a separately-configured value that could drift from it.
  assert.strictEqual(c.gas_seed_wallet_address, kp.publicKey.toBase58())
  assert.strictEqual(c.gas_seed_wallet_address, gasSeedAddressFromSecret(key))
})

test('native SOL + USDC bound to the active network from its secret mint', () => {
  const rows = buildSeedRows(solDevnet({ CHAIN_SOLANA_DEVNET_USDC_MINT: MINT }))
  const usdc = rows.assets.find((a) => a.id === 'USDC_SOL')
  assert.ok(usdc)
  assert.strictEqual(usdc.chain_id, 'solana:devnet')
  assert.strictEqual(usdc.token_address, MINT)
  assert.strictEqual(usdc.decimals, 6)
  assert.strictEqual(usdc.is_stable, true)
  const native = rows.assets.find((a) => a.token_address === null)
  assert.ok(native && native.id === 'SOL_DEVNET' && native.decimals === 9)
  assert.strictEqual(rows.skipped.length, 0)
})

test('missing USDC mint → USDC_SOL skipped with a named warning, never silent', () => {
  const rows = buildSeedRows(solDevnet())
  assert.strictEqual(
    rows.assets.some((a) => a.id === 'USDC_SOL'),
    false,
  )
  assert.strictEqual(rows.skipped.length, 1)
  assert.match(rows.skipped[0] ?? '', /USDC_SOL/)
})

test('BASE: chain + manifest USDC + native ETH, treasury/escrow from secrets', () => {
  const rows = buildSeedRows(baseMainnet())
  const base = rows.chains.find((c) => c.id === 'eip155:8453')
  assert.ok(base)
  assert.strictEqual(base.escrow_program, EVM_ESCROW)
  assert.strictEqual(base.treasury_address, EVM_TREASURY)
  assert.strictEqual(base.min_confirmations, 2) // manifest: 2 for an L2 (was 5)
  const usdc = rows.assets.find((a) => a.id === 'USDC_BASE')
  assert.ok(usdc)
  assert.strictEqual(usdc.token_address, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
  assert.ok(usdc.decimals === 6 && usdc.is_stable === true)
  const eth = rows.assets.find((a) => a.id === 'ETH_BASE')
  assert.ok(eth && eth.token_address === null && eth.decimals === 18)
})

test('CELO: manifest token constants + feeCurrency cUSD, native CELO', () => {
  const rows = buildSeedRows(celoMainnet())
  const celo = rows.chains.find((c) => c.id === 'eip155:42220')
  assert.ok(celo && celo.min_confirmations === 3)
  const ids = rows.assets.map((a) => a.id)
  assert.ok(ids.includes('cUSD') && ids.includes('USDC_CELO') && ids.includes('CELO'))
  const cusd = rows.assets.find((a) => a.id === 'cUSD')
  assert.ok(cusd)
  assert.strictEqual(cusd.token_address, '0x765DE816845861e75A25fCA122bb6898B8B1282a')
  assert.strictEqual(cusd.decimals, 18)
  const native = rows.assets.find((a) => a.id === 'CELO')
  assert.ok(native && native.token_address === null && native.is_stable === false)
})

test('different-family chains seed together', () => {
  const rows = buildSeedRows(
    loadChainSecrets({
      CHAIN_SOLANA_DEVNET_RPC_URL: RPC,
      CHAIN_SOLANA_DEVNET_TREASURY_ADDR: SOL,
      CHAIN_SOLANA_DEVNET_USDC_MINT: MINT,
      CHAIN_EIP155_8453_RPC_URL: RPC,
      CHAIN_EIP155_8453_ESCROW_ADDR: EVM_ESCROW,
      CHAIN_EIP155_8453_TREASURY_ADDR: EVM_TREASURY,
    }),
  )
  assert.deepStrictEqual(rows.chains.map((c) => c.id).sort(), ['eip155:8453', 'solana:devnet'])
})

test('fiat providers are always seeded', () => {
  assert.ok(buildSeedRows(solDevnet()).fiat_providers.length >= 1)
})

// ---------------------------------------------------------------------------
// enablementDelta — the "no diff, no write" property behind SEED_ON_BOOT
// ---------------------------------------------------------------------------

test('enablementDelta: an already-correct registry produces no writes at all', () => {
  // The property that matters. applySeed runs on every container start under
  // SEED_ON_BOOT; blanket UPDATEs would burn a dead tuple per row per boot and,
  // during a rolling deploy, let replicas with different envs flip the same
  // rows back and forth while clients poll /v1/platform/chains.
  const delta = enablementDelta(
    [
      { id: 'solana:devnet', is_enabled: true },
      { id: 'eip155:84532', is_enabled: true },
      { id: 'eip155:1', is_enabled: false },
    ],
    ['solana:devnet', 'eip155:84532'],
  )
  assert.deepStrictEqual(delta, { toEnable: [], toDisable: [] })
})

test('enablementDelta: only the rows actually out of step are listed', () => {
  const delta = enablementDelta(
    [
      { id: 'a', is_enabled: false }, // active but off -> enable
      { id: 'b', is_enabled: true }, // active and on  -> untouched
      { id: 'c', is_enabled: true }, // inactive but on -> disable
      { id: 'd', is_enabled: false }, // inactive and off -> untouched
    ],
    ['a', 'b'],
  )
  assert.deepStrictEqual(delta, { toEnable: ['a'], toDisable: ['c'] })
})

test('enablementDelta: an active id with no stored row is neither enabled nor disabled', () => {
  // The upsert has already inserted it, enabled by default; listing it here
  // would issue a redundant UPDATE on every boot for every new chain.
  assert.deepStrictEqual(enablementDelta([], ['brand-new']), { toEnable: [], toDisable: [] })
})

test('enablementDelta: an empty active set disables everything still on', () => {
  // The shape of a deploy that lost its CHAIN_* vars — which is exactly what
  // boot-seed's live-escrow guard refuses to let through silently.
  assert.deepStrictEqual(
    enablementDelta([{ id: 'a', is_enabled: true }, { id: 'b', is_enabled: false }], []),
    { toEnable: [], toDisable: ['a'] },
  )
})

// ---------- escrow-contract history (open_issues #89) ------------------------

test('the seed emits a chain_contracts row per chain, carrying the deploy block', () => {
  // This row set is what makes a redeploy self-recording: the operator changes
  // ESCROW_ADDR and the next boot appends. If the builder ever stops emitting
  // it, nothing fails loudly — the history simply stops growing and the next
  // superseded contract strands its escrows.
  const rows = buildSeedRows(
    loadChainSecrets({
      CHAIN_EIP155_8453_RPC_URL: RPC,
      CHAIN_EIP155_8453_ESCROW_ADDR: EVM_ESCROW,
      CHAIN_EIP155_8453_TREASURY_ADDR: EVM_TREASURY,
      CHAIN_EIP155_8453_ESCROW_DEPLOY_BLOCK: '44318123',
    }),
  )
  assert.deepStrictEqual(rows.chain_contracts, [
    { chain_id: 'eip155:8453', address: EVM_ESCROW.toLowerCase(), deploy_block: 44_318_123 },
  ])
})

test('the seed NORMALISES the recorded address, whatever casing env carries', () => {
  // Deploy output is usually checksummed. Stored unnormalised, the same contract
  // would occupy two rows and read as two generations — which would then make
  // every unstamped escrow on that chain "ambiguous" and refuse to build.
  const checksummed = '0x954FC8a4908f49B7499504190ab11d925dEE490b'
  const rows = buildSeedRows(
    loadChainSecrets({
      CHAIN_EIP155_8453_RPC_URL: RPC,
      CHAIN_EIP155_8453_ESCROW_ADDR: checksummed,
      CHAIN_EIP155_8453_TREASURY_ADDR: EVM_TREASURY,
    }),
  )
  assert.strictEqual(rows.chain_contracts[0].address, checksummed.toLowerCase())
})

test('a Solana chain records the IDL program id verbatim, with no deploy block', () => {
  // base58 casing is identity, so normalising must NOT touch it; and Solana has
  // no deploy-block secret to carry.
  const rows = buildSeedRows(solDevnet())
  assert.deepStrictEqual(rows.chain_contracts, [
    { chain_id: 'solana:devnet', address: rows.chains[0].escrow_program, deploy_block: null },
  ])
})

test('the recorded address always matches the chain row it accompanies', () => {
  // One source (`escrowAddressOf`) feeds both, and they must not be able to
  // drift: `chains.escrow_program` says CURRENT, `chain_contracts` says LEGITIMATE,
  // and the current contract must always be legitimate.
  const rows = buildSeedRows(baseMainnet())
  for (const chain of rows.chains) {
    const recorded = rows.chain_contracts.filter((r) => r.chain_id === chain.id)
    assert.strictEqual(recorded.length, 1)
    assert.strictEqual(recorded[0].address, chain.escrow_program.toLowerCase())
  }
})
