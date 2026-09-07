/**
 * db/seed-v2 — the GAS-SEED columns specifically: `chains.gas_seed_amount_raw`
 * and `gas_seed_wallet_address`, which the paired CHECK constraint forces to be
 * set or NULL together.
 *
 * Split from seed-v2.test.ts (which sits at the 300-line ceiling) when #53a
 * gave these columns an EVM arm, the same way secrets-relayer.test.ts was split
 * off secrets.test.ts. Same fixtures, built through the real secrets loader.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { chainById } from '@tenda/shared'
import { buildSeedRows } from '@server/db/seed-v2'
import { gasSeedAddressFromSecret } from '@server/features/gas-seed/senders/solana'
import { evmGasSeedAddressFromKey } from '@server/features/gas-seed/senders/evm'
import { loadChainSecrets } from '@server/chains/secrets'

const SOL = 'So11111111111111111111111111111111111111112'
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const EVM_ESCROW = '0x00000000000000000000000000000000000000e5'
const EVM_TREASURY = '0x00000000000000000000000000000000000000a1'
const RPC = 'https://rpc.example'

const solDevnet = (extra: NodeJS.ProcessEnv = {}) =>
  loadChainSecrets({ CHAIN_SOLANA_DEVNET_RPC_URL: RPC, CHAIN_SOLANA_DEVNET_TREASURY_ADDR: SOL, ...extra })

/** 0G mainnet: the one EVM manifest entry that declares a gas-seed amount. */
const zeroGMainnet = (extra: NodeJS.ProcessEnv = {}) =>
  loadChainSecrets({
    CHAIN_EIP155_16661_RPC_URL: RPC,
    CHAIN_EIP155_16661_ESCROW_ADDR: EVM_ESCROW,
    CHAIN_EIP155_16661_TREASURY_ADDR: EVM_TREASURY,
    ...extra,
  })

test('gas-seed pair populates from the manifest amount + derived funder when the key is set', () => {
  const kp = Keypair.generate()
  const key = bs58.encode(kp.secretKey)
  const rows = buildSeedRows(
    solDevnet({ CHAIN_SOLANA_DEVNET_USDC_MINT: MINT, CHAIN_SOLANA_DEVNET_GAS_SEED_KEY: key }),
  )
  const c = rows.chains[0]
  assert.ok(c)
  // Against the MANIFEST, not a literal: the amount is the manifest's to own
  // (#53b re-measures 0G's), and a copy of it here would fail the day it moves
  // without anything actually being wrong.
  assert.strictEqual(c.gas_seed_amount_raw, chainById('solana:devnet').gasSeedAmountRaw)
  // Funder address is DERIVED from the same secret the sender signs with — never
  // a separately-configured value that could drift from it.
  assert.strictEqual(c.gas_seed_wallet_address, kp.publicKey.toBase58())
  assert.strictEqual(c.gas_seed_wallet_address, gasSeedAddressFromSecret(key))
})

test('EVM gas-seed pair populates the same way Solana\'s does (#53a)', () => {
  // The defect this closes: `resolveGasSeed` asked `namespace === 'solana'`, so
  // 0G — the one EVM chain that declares a seed amount — seeded NULL into both
  // columns, `findSeedableChains` never returned it, and dispatch never saw it.
  const key = `0x${'cd'.repeat(32)}` as const
  const rows = buildSeedRows(zeroGMainnet({ CHAIN_EIP155_16661_GAS_SEED_KEY: key }))
  const c = rows.chains.find((row) => row.id === 'eip155:16661')
  assert.ok(c)
  assert.strictEqual(c.gas_seed_amount_raw, chainById('eip155:16661').gasSeedAmountRaw)
  assert.strictEqual(c.gas_seed_wallet_address, evmGasSeedAddressFromKey(key))
  assert.strictEqual(
    rows.skipped.some((sk) => sk.includes('gas seed')),
    false,
    'a funded seed is not a skip',
  )
})

test('a declared seed with no key stays dormant AND says so (#53a)', () => {
  // Both columns NULL keeps the paired CHECK satisfied — but silence was the
  // real defect: nothing at boot, at seed time or on the wire said the seed
  // was declared and unpayable. The seeder already warns each `skipped` line.
  const rows = buildSeedRows(zeroGMainnet())
  const c = rows.chains.find((row) => row.id === 'eip155:16661')
  assert.ok(c)
  assert.strictEqual(c.gas_seed_amount_raw, null)
  assert.strictEqual(c.gas_seed_wallet_address, null)
  const dormant = rows.skipped.filter((sk) => sk.includes('gas seed'))
  assert.strictEqual(dormant.length, 1)
  // The FULL variable name, not the suffix: an operator must be able to paste
  // it. `/GAS_SEED_KEY/` alone passed on the old message too, so it guarded
  // nothing.
  assert.match(dormant[0] ?? '', /CHAIN_EIP155_16661_GAS_SEED_KEY not configured/)
})

test('a seed key on a chain that declares no amount funds nothing and warns nothing', () => {
  // BASE has no gasSeedAmountRaw (its gas policy is a paymaster), so a key
  // there is an unused key, not a dormant seed. Reporting it would train the
  // reader to ignore the line that matters.
  const rows = buildSeedRows(
    loadChainSecrets({
      CHAIN_EIP155_8453_RPC_URL: RPC,
      CHAIN_EIP155_8453_ESCROW_ADDR: EVM_ESCROW,
      CHAIN_EIP155_8453_TREASURY_ADDR: EVM_TREASURY,
      CHAIN_EIP155_8453_GAS_SEED_KEY: `0x${'cd'.repeat(32)}`,
    }),
  )
  const c = rows.chains.find((row) => row.id === 'eip155:8453')
  assert.ok(c)
  assert.strictEqual(c.gas_seed_amount_raw, null)
  assert.strictEqual(c.gas_seed_wallet_address, null)
  assert.deepStrictEqual(rows.skipped, [])
})
