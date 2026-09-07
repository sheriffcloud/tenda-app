/**
 * The SERVER-HELD hot-wallet secrets on both namespaces — the relayer key
 * (#18), the sweep switch it must not imply (#43), and the gas-seed key that
 * is deliberately neither of them (#53a). Split from secrets.test.ts, which
 * sits at the 300-line ceiling, rather than grown into it. Same fixtures: the
 * minimal env that activates exactly one chain.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { loadChainSecrets } from '@server/chains/secrets'

const SOL_PUBKEY = '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
const EVM_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

function solanaDevnetEnv(): NodeJS.ProcessEnv {
  return {
    CHAIN_SOLANA_DEVNET_RPC_URL: 'https://api.devnet.solana.com',
    CHAIN_SOLANA_DEVNET_TREASURY_ADDR: SOL_PUBKEY,
  }
}

function baseMainnetEnv(): NodeJS.ProcessEnv {
  return {
    CHAIN_EIP155_8453_RPC_URL: 'https://base-sepolia.example/v2/key',
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM_ADDR,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM_ADDR,
  }
}

test('relayerKey (#18): an EVM key is captured when well-formed, refused by name when not', () => {
  const key = `0x${'ab'.repeat(32)}`
  const ok = loadChainSecrets({ ...baseMainnetEnv(), CHAIN_EIP155_8453_RELAYER_KEY: key })
  const secret = ok.get('eip155:8453')
  assert.equal(secret?.namespace === 'eip155' ? secret.relayerKey : undefined, key)
  // Absent → undefined, the adapter then offers no relay surface.
  const none = loadChainSecrets(baseMainnetEnv()).get('eip155:8453')
  assert.equal(none?.namespace === 'eip155' ? none.relayerKey : 'wrong-ns', undefined)
  // An address, a short key, a missing 0x: each is a boot error naming the key.
  for (const bad of [EVM_ADDR, `0x${'ab'.repeat(31)}`, 'ab'.repeat(32)]) {
    assert.throws(
      () => loadChainSecrets({ ...baseMainnetEnv(), CHAIN_EIP155_8453_RELAYER_KEY: bad }),
      /CHAIN_EIP155_8453_RELAYER_KEY/,
    )
  }
})

test('relayerKey (#18): the Solana key rides the solana shape when it is a 64-byte base58 secret, and is refused by name otherwise', () => {
  const key = bs58.encode(Keypair.generate().secretKey)
  const secret = loadChainSecrets({ ...solanaDevnetEnv(), CHAIN_SOLANA_DEVNET_RELAYER_KEY: key }).get('solana:devnet')
  assert.equal(secret?.namespace === 'solana' ? secret.relayerKey : undefined, key)
  // A public key (32 bytes), a 0x key, free text, and a 63-byte key whose base58
  // LENGTH looks right (87 chars) are each a boot error naming the key.
  const sixtyThreeBytes = bs58.encode(new Uint8Array(63).fill(255))
  for (const bad of [SOL_PUBKEY, `0x${'ab'.repeat(32)}`, 'base58secret', sixtyThreeBytes]) {
    assert.throws(
      () => loadChainSecrets({ ...solanaDevnetEnv(), CHAIN_SOLANA_DEVNET_RELAYER_KEY: bad }),
      /CHAIN_SOLANA_DEVNET_RELAYER_KEY/,
    )
  }
})

test('sweepEnabled (#43): OFF unless asked for, and a relayer key is not asking', () => {
  const key = `0x${'ab'.repeat(32)}`
  const evm = (env: NodeJS.ProcessEnv) => {
    const s = loadChainSecrets(env).get('eip155:8453')
    return s?.namespace === 'eip155' ? s : undefined
  }

  // The case the flag exists for: a chain fully set up to relay for agents,
  // which must NOT thereby be spending that float on sweeps.
  assert.equal(evm({ ...baseMainnetEnv(), CHAIN_EIP155_8453_RELAYER_KEY: key })?.sweepEnabled, false)
  // No key, no flag, no chain-level anything: still false, never undefined —
  // the consumer reads a decision here, not the absence of one.
  assert.equal(evm(baseMainnetEnv())?.sweepEnabled, false)
  // Explicitly declined reads the same as never mentioned.
  assert.equal(
    evm({ ...baseMainnetEnv(), CHAIN_EIP155_8453_SWEEP_ENABLED: 'false' })?.sweepEnabled,
    false,
  )
  // And on.
  assert.equal(
    evm({ ...baseMainnetEnv(), CHAIN_EIP155_8453_SWEEP_ENABLED: 'true' })?.sweepEnabled,
    true,
  )
})

test('sweepEnabled (#43): anything that is not the two literals is a boot error naming the key', () => {
  // A value that merely LOOKS like consent must never read as consent — the
  // #34 lesson, applied to the one flag that authorises spending money. Each of
  // these would silently mean `false` under a truthiness check.
  for (const bad of ['yes', 'True', 'TRUE', '1', 'on', 'enabled']) {
    assert.throws(
      () => loadChainSecrets({ ...baseMainnetEnv(), CHAIN_EIP155_8453_SWEEP_ENABLED: bad }),
      /CHAIN_EIP155_8453_SWEEP_ENABLED/,
      `'${bad}' must be refused by name`,
    )
  }
})

test('sweepEnabled (#43): the shared env boundary still owns whitespace and emptiness', () => {
  // NOT a hole in the strict check above: `optionalEnv` trims every chain var
  // and maps empty-after-trim to absent (#34), so a stray space around a real
  // value is fine and a blank var means "unset" rather than "false decided".
  // Asserted here because a future strictness pass could plausibly break either
  // and both are load-bearing for an operator editing a .env by hand.
  const read = (v: string) => {
    const s = loadChainSecrets({ ...baseMainnetEnv(), CHAIN_EIP155_8453_SWEEP_ENABLED: v }).get('eip155:8453')
    return s?.namespace === 'eip155' ? s.sweepEnabled : 'wrong-ns'
  }
  assert.equal(read(' true '), true, 'surrounding whitespace is trimmed, not rejected')
  assert.equal(read(''), false, 'a blank var is unset, and unset is off')
  assert.equal(read('   '), false)
})

test('gasSeedKey (#53a): the EVM seed key is captured when well-formed, refused by name when not', () => {
  const key = `0x${'cd'.repeat(32)}`
  const ok = loadChainSecrets({ ...baseMainnetEnv(), CHAIN_EIP155_8453_GAS_SEED_KEY: key })
  const secret = ok.get('eip155:8453')
  assert.equal(secret?.namespace === 'eip155' ? secret.gasSeedKey : undefined, key)
  // Absent → undefined, and the chain's gas columns then seed NULL.
  const none = loadChainSecrets(baseMainnetEnv()).get('eip155:8453')
  assert.equal(none?.namespace === 'eip155' ? none.gasSeedKey : 'wrong-ns', undefined)
  // Same evmKey shape as the relayer key: an address, a short key, a bare hex
  // string are each a boot error naming THIS variable, not the other one.
  for (const bad of [EVM_ADDR, `0x${'cd'.repeat(31)}`, 'cd'.repeat(32)]) {
    assert.throws(
      () => loadChainSecrets({ ...baseMainnetEnv(), CHAIN_EIP155_8453_GAS_SEED_KEY: bad }),
      /CHAIN_EIP155_8453_GAS_SEED_KEY/,
    )
  }
})

test('gasSeedKey (#53a): seed and relayer floats are separate keys, never one wallet by default', () => {
  // The whole reason it is its own variable: relaying serves a flow an agent
  // asked for, seeding is an open-ended outflow to every user who links a
  // wallet. Configuring one must not enrol the other's wallet.
  const relayer = `0x${'ab'.repeat(32)}`
  const seed = `0x${'cd'.repeat(32)}`
  const both = loadChainSecrets({
    ...baseMainnetEnv(),
    CHAIN_EIP155_8453_RELAYER_KEY: relayer,
    CHAIN_EIP155_8453_GAS_SEED_KEY: seed,
  }).get('eip155:8453')
  assert.ok(both?.namespace === 'eip155')
  assert.equal(both.relayerKey, relayer)
  assert.equal(both.gasSeedKey, seed)

  // Only the relayer configured: the seed stays dormant rather than inheriting.
  const relayOnly = loadChainSecrets({
    ...baseMainnetEnv(),
    CHAIN_EIP155_8453_RELAYER_KEY: relayer,
  }).get('eip155:8453')
  assert.equal(relayOnly?.namespace === 'eip155' ? relayOnly.gasSeedKey : 'wrong-ns', undefined)
})
