/**
 * chains/index — generic adapter construction from active secrets + manifest,
 * and the registry wrapper. Deps are stubbed (never invoked at construction);
 * secrets are built through the real loader so the (secret → adapter) wiring is
 * exercised end-to-end.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  buildAdapters,
  buildChainRegistry,
  resolveEvmRpcFallback,
  type AdapterDepsFactory,
} from '@server/chains'
import { loadChainSecrets } from '@server/chains/secrets'
import { buildContractRegistry } from '@server/chains/contracts'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { chainById } from '@tenda/shared'

const SOL = 'So11111111111111111111111111111111111111112'
const EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const RPC = 'https://rpc.example'

const STUB: AdapterDepsFactory = {
  solana: () => ({
    resolveWalletAddress: async () => 'wallet',
    resolveAsset: async () => ({ token_address: null }),
  }),
  evm: () => ({
    resolveWalletAddress: async () => 'wallet',
    resolveAsset: async () => ({ token_address: null }),
  }),
}

const solSecrets = () =>
  loadChainSecrets({ CHAIN_SOLANA_DEVNET_RPC_URL: RPC, CHAIN_SOLANA_DEVNET_TREASURY_ADDR: SOL })
const baseSecrets = () =>
  loadChainSecrets({
    CHAIN_EIP155_8453_RPC_URL: RPC,
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM,
  })
const celoSecrets = () =>
  loadChainSecrets({
    CHAIN_EIP155_42220_RPC_URL: RPC,
    CHAIN_EIP155_42220_ESCROW_ADDR: EVM,
    CHAIN_EIP155_42220_TREASURY_ADDR: EVM,
  })

test('buildAdapters: a solana secret yields one solana adapter', () => {
  const adapters = buildAdapters(solSecrets(), STUB)
  assert.strictEqual(adapters.length, 1)
  assert.strictEqual(adapters[0]?.chain_id, 'solana:devnet')
  assert.strictEqual(adapters[0]?.namespace, 'solana')
})

test('buildAdapters: an EVM secret yields one eip155 adapter', () => {
  const adapters = buildAdapters(baseSecrets(), STUB)
  assert.strictEqual(adapters[0]?.chain_id, 'eip155:8453')
  assert.strictEqual(adapters[0]?.namespace, 'eip155')
})

test('buildAdapters: a feeCurrency (CELO) secret builds its adapter with the manifest fee token', () => {
  // Exercises the feeCurrency branch + requireFeeCurrency (resolves cUSD's
  // manifest address); a missing address would throw at build.
  const adapters = buildAdapters(celoSecrets(), STUB)
  assert.strictEqual(adapters[0]?.chain_id, 'eip155:42220')
  assert.strictEqual(adapters[0]?.namespace, 'eip155')
})

test('buildAdapters: empty secrets yield no adapters', () => {
  assert.strictEqual(buildAdapters(loadChainSecrets({}), STUB).length, 0)
})

test('buildChainRegistry: has/get/list over built adapters', () => {
  const r = buildChainRegistry(buildAdapters(solSecrets(), STUB))
  assert.strictEqual(r.has('solana:devnet'), true)
  assert.strictEqual(r.has('eip155:8453'), false)
  assert.strictEqual(r.get('solana:devnet').chain_id, 'solana:devnet')
  assert.strictEqual(r.list().length, 1)
})

test('buildChainRegistry: get() throws on an unregistered chain id', () => {
  const r = buildChainRegistry(buildAdapters(solSecrets(), STUB))
  assert.throws(() => r.get('eip155:8453'), /no adapter registered/)
})

test('buildChainRegistry: a duplicate chain id throws at build', () => {
  const adapters = buildAdapters(solSecrets(), STUB)
  assert.throws(() => buildChainRegistry([...adapters, ...adapters]), /duplicate chain registration/)
})

// ---------- resolveEvmRpcFallback (failover endpoint selection) --------------

test('rpc fallback: defaults to the manifest publicRpcUrl when no override', () => {
  const secret = baseSecrets().get('eip155:8453')
  assert.ok(secret && secret.namespace === 'eip155')
  assert.strictEqual(
    resolveEvmRpcFallback(secret, chainById('eip155:8453')),
    'https://mainnet.base.org',
  )
})

test('rpc fallback: the RPC_URL_FALLBACK secret overrides the default', () => {
  const secrets = loadChainSecrets({
    CHAIN_EIP155_8453_RPC_URL: RPC,
    CHAIN_EIP155_8453_RPC_URL_FALLBACK: 'https://keyed-fallback.example/v2/key',
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM,
  })
  const secret = secrets.get('eip155:8453')
  assert.ok(secret && secret.namespace === 'eip155')
  assert.strictEqual(
    resolveEvmRpcFallback(secret, chainById('eip155:8453')),
    'https://keyed-fallback.example/v2/key',
  )
})

test('rpc fallback: dropped when it would duplicate the primary', () => {
  // Primary IS the public endpoint → failing over to itself is pointless.
  const secrets = loadChainSecrets({
    CHAIN_EIP155_8453_RPC_URL: 'https://mainnet.base.org',
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM,
  })
  const secret = secrets.get('eip155:8453')
  assert.ok(secret && secret.namespace === 'eip155')
  assert.strictEqual(resolveEvmRpcFallback(secret, chainById('eip155:8453')), undefined)
})

test('rpc fallback: an explicit override equal to the primary is also dropped', () => {
  const secrets = loadChainSecrets({
    CHAIN_EIP155_8453_RPC_URL: RPC,
    CHAIN_EIP155_8453_RPC_URL_FALLBACK: RPC,
    CHAIN_EIP155_8453_ESCROW_ADDR: EVM,
    CHAIN_EIP155_8453_TREASURY_ADDR: EVM,
  })
  const secret = secrets.get('eip155:8453')
  assert.ok(secret && secret.namespace === 'eip155')
  assert.strictEqual(resolveEvmRpcFallback(secret, chainById('eip155:8453')), undefined)
})

// ---------- the contract set actually reaches the adapter (open_issues #89) ---

/**
 * The wiring bug this pins: every piece of the contract-generation fix can be
 * correct and the SERVER still behave as before, because the adapter defaults to
 * "only my current contract" when nobody hands it the set. Constructing an
 * adapter directly in a test hides that completely — the test supplies what
 * production forgot.
 *
 * So these go through the REAL `buildAdapters`, the same call `plugins/chains.ts`
 * makes, and assert on decoded behaviour rather than on a constructor argument.
 */

const PREVIOUS_EVM = '0xd6E82103C674747ba7E54195D690e40F1f6f4d1C'

function registryWithPrevious() {
  return buildContractRegistry(
    [{ chain_id: 'eip155:8453', namespace: 'eip155', escrowAddress: EVM }],
    [{ chain_id: 'eip155:8453', address: PREVIOUS_EVM.toLowerCase() }],
  )
}

/** An EscrowCreated receipt log emitted by `address`. */
function createdLogFrom(address: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowCreated',
    args: {
      escrowId: '0x111111112222433384445555555555555'.slice(0, 34) as `0x${string}`,
      creator: '0x1111111111111111111111111111111111111111',
    },
  })
  return {
    address,
    topics: [...topics] as `0x${string}`[],
    data: encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'address' }, { type: 'uint256' }],
      [0, '0x2222222222222222222222222222222222222222', 1_000_000n],
    ),
  }
}

/** Deps whose RPC returns a receipt whose only escrow log came from `address`. */
function depsReturning(address: `0x${string}`): AdapterDepsFactory {
  return {
    solana: STUB.solana,
    evm: () => ({
      resolveWalletAddress: async () => 'wallet',
      resolveAsset: async () => ({ token_address: null }),
      rpc: {
        async getTransactionReceipt() {
          return { block_number: 1n, status: 'success' as const, logs: [createdLogFrom(address)] }
        },
        async getBlockNumber() {
          return 10n
        },
        async getLogRefs() {
          return []
        },
        async readEscrow() {
          return null
        },
        async readPermitFacts() {
          throw new Error('not used')
        },
      },
    }),
  }
}

test('buildAdapters: the registry set reaches the adapter, so a PREVIOUS contract verifies', async () => {
  const [adapter] = buildAdapters(
    baseSecrets(),
    depsReturning(PREVIOUS_EVM as `0x${string}`),
    registryWithPrevious(),
  )

  const verified = await adapter.verifyTx(`0x${'ab'.repeat(32)}`, { expected_event: 'EscrowCreated' })

  assert.strictEqual(verified.confirmed, true)
  assert.strictEqual(
    'failed' in verified ? verified.failed : undefined,
    false,
    'a superseded contract known to the registry must still verify — if this fails, the ' +
      'registry is not reaching buildAdapters and the whole fix is inert in production',
  )
  assert.strictEqual(
    'event' in verified ? verified.event.contract : undefined,
    PREVIOUS_EVM.toLowerCase(),
  )
})

test('buildAdapters: WITHOUT a registry an adapter knows only its current contract', async () => {
  // The documented default, and the pre-#89 behaviour: absent registry means a
  // previous contract is not recognised. Pins that the parameter is what does
  // the work, not an unconditional widening somewhere downstream.
  const [adapter] = buildAdapters(baseSecrets(), depsReturning(PREVIOUS_EVM as `0x${string}`))

  const verified = await adapter.verifyTx(`0x${'ab'.repeat(32)}`, { expected_event: 'EscrowCreated' })

  assert.strictEqual('failed' in verified ? verified.failed : undefined, true)
})

test('buildAdapters: a chain missing from the registry falls back to its current contract', async () => {
  // Defensive: a registry that has no entry for this chain must not blank the
  // adapter's own address, or the chain would verify nothing at all.
  const empty = buildContractRegistry([], [])
  const [adapter] = buildAdapters(baseSecrets(), depsReturning(EVM as `0x${string}`), empty)

  const verified = await adapter.verifyTx(`0x${'ab'.repeat(32)}`, { expected_event: 'EscrowCreated' })

  assert.strictEqual('failed' in verified ? verified.failed : undefined, false)
})
