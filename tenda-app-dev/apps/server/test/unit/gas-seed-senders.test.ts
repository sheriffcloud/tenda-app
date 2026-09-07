/**
 * features/gas-seed/senders — the namespace registry and the per-CHAIN sender map
 * built from it (#53a).
 *
 * What is worth testing here is not that viem and web3.js work; it is the two
 * facts the rest of the seed rests on: a funder address derives from the same
 * secret its sender will sign with (no drift, which is what
 * `chains.gas_seed_wallet_address` records), and every active chain that
 * configured a key gets its OWN sender — never a sibling's.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { privateKeyToAccount } from 'viem/accounts'
import { GAS_SEED_SUPPORT, buildGasSeedSenders } from '@server/features/gas-seed'
import type { ResolvedChainSecret } from '@server/chains/secrets'

const EVM_KEY = `0x${'cd'.repeat(32)}` as const
const EVM_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

function evmSecret(chainId: string, gasSeedKey?: string): ResolvedChainSecret {
  return {
    namespace: 'eip155',
    chainId,
    rpcUrl: 'https://rpc.example/v2/key',
    escrow: EVM_ADDR,
    treasury: EVM_ADDR,
    ...(gasSeedKey === undefined ? {} : { gasSeedKey }),
  }
}

function solanaSecretFor(gasSeedKey?: string): ResolvedChainSecret {
  return {
    namespace: 'solana',
    chainId: 'solana:devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    treasury: '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes',
    ...(gasSeedKey === undefined ? {} : { gasSeedKey }),
  }
}

function secretsOf(...list: ResolvedChainSecret[]): ReadonlyMap<string, ResolvedChainSecret> {
  return new Map(list.map((s) => [s.chainId, s]))
}

test('addressFromKey derives the funder EVM address the sender will sign with', () => {
  // The property `chains.gas_seed_wallet_address` exists to record: the funder
  // written at seed time IS the wallet that pays. Compared against viem's own
  // derivation rather than a literal, so the test cannot pass by matching a
  // hardcoded string that drifted from the key beside it.
  assert.equal(
    GAS_SEED_SUPPORT.eip155.addressFromKey(EVM_KEY),
    privateKeyToAccount(EVM_KEY).address,
  )
})

test('addressFromKey derives the funder Solana address the sender will sign with', () => {
  const keypair = Keypair.generate()
  assert.equal(
    GAS_SEED_SUPPORT.solana.addressFromKey(bs58.encode(keypair.secretKey)),
    keypair.publicKey.toBase58(),
  )
})

test('addressFromKey throws on a malformed key rather than recording a wrong funder', () => {
  // Fail-fast at seed time: a funder column that silently held nonsense would
  // be discovered by the verify script long after the money moved.
  assert.throws(() => GAS_SEED_SUPPORT.eip155.addressFromKey('not-a-key'))
  assert.throws(() => GAS_SEED_SUPPORT.solana.addressFromKey('not-a-key'))
})

test('buildGasSeedSenders keys by chain id, and only for chains that configured a key', () => {
  const senders = buildGasSeedSenders(
    secretsOf(
      evmSecret('eip155:16661', EVM_KEY),
      evmSecret('eip155:84532'), // active, no seed key
      solanaSecretFor(bs58.encode(Keypair.generate().secretKey)),
    ),
  )
  assert.deepEqual([...senders.keys()].sort(), ['eip155:16661', 'solana:devnet'])
  assert.equal(senders.has('eip155:84532'), false)
})

test('two EVM chains each get their OWN sender instance', () => {
  // A namespace-keyed map would hold one 'eip155' entry here and pay both
  // chains through it — the defect #53a removes. Distinct instances are the
  // observable consequence of per-chain construction.
  const senders = buildGasSeedSenders(
    secretsOf(evmSecret('eip155:16661', EVM_KEY), evmSecret('eip155:84532', EVM_KEY)),
  )
  assert.equal(senders.size, 2)
  assert.notStrictEqual(senders.get('eip155:16661'), senders.get('eip155:84532'))
})

test('no configured keys → an empty map, not a partially-populated one', () => {
  const senders = buildGasSeedSenders(secretsOf(evmSecret('eip155:16661'), solanaSecretFor()))
  assert.equal(senders.size, 0)
})

test('the sender map answers a prototype key with nothing', () => {
  // Chain ids are data. A plain object would answer 'constructor' with an
  // inherited function, and dispatch would then "find" a sender and call it —
  // the prototype-key trap this codebase has already been bitten by once.
  const senders = buildGasSeedSenders(secretsOf(evmSecret('eip155:16661', EVM_KEY)))
  assert.equal(senders.get('constructor'), undefined)
  assert.equal(senders.get('toString'), undefined)
})
