import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  DEFAULT_RPC_TIMEOUT_MS,
  FALLBACK_RPC_TIMEOUT_MS,
  distinctFallbackUrl,
  failoverSolanaRpc,
  perEndpointTimeoutMs,
  solanaConnectionConfig,
  type SolanaRpc,
} from '@server/chains/solana/rpc'

const PRIMARY_ERROR = new Error('primary unavailable')

function solRpc(over: Partial<SolanaRpc> = {}): SolanaRpc {
  return {
    getLatestBlockhash: async () => ({ blockhash: 'BH', last_valid_block_height: 100 }),
    getTransaction: async () => null,
    getAccount: async () => null,
    getSignaturesForAddress: async () => [],
    ...over,
  }
}

test('failover uses secondary after primary transport failure', async () => {
  let secondaryCalls = 0
  const rpc = failoverSolanaRpc(
    solRpc({ getTransaction: async () => { throw PRIMARY_ERROR } }),
    solRpc({ getTransaction: async () => { secondaryCalls += 1; return null } }),
  )
  assert.strictEqual(await rpc.getTransaction('sig'), null)
  assert.strictEqual(secondaryCalls, 1)
})

test('every Solana read method delegates to its matching fallback method', async () => {
  const secondary = solRpc({
    getLatestBlockhash: async () => ({ blockhash: 'fallback', last_valid_block_height: 200 }),
    getTransaction: async (signature) => ({
      failed: false,
      failure_reason: null,
      log_messages: [signature],
    }),
    getAccount: async (address) => ({ data: Buffer.from(address), owner: 'fallback-owner' }),
    getSignaturesForAddress: async (address, opts) => [{ signature: address, slot: opts.limit }],
  })
  const fail = async (): Promise<never> => { throw PRIMARY_ERROR }
  const rpc = failoverSolanaRpc(solRpc({
    getLatestBlockhash: fail,
    getTransaction: fail,
    getAccount: fail,
    getSignaturesForAddress: fail,
  }), secondary)

  assert.deepEqual(await rpc.getLatestBlockhash(), {
    blockhash: 'fallback',
    last_valid_block_height: 200,
  })
  assert.deepEqual((await rpc.getTransaction('tx'))?.log_messages, ['tx'])
  assert.equal((await rpc.getAccount('account'))?.owner, 'fallback-owner')
  assert.deepEqual(await rpc.getSignaturesForAddress('program', { limit: 7 }), [
    { signature: 'program', slot: 7 },
  ])
})

test('failover does not touch secondary after primary success', async () => {
  let secondaryCalls = 0
  const rpc = failoverSolanaRpc(
    solRpc({ getAccount: async () => ({ data: Buffer.from('ok'), owner: 'owner' }) }),
    solRpc({ getAccount: async () => { secondaryCalls += 1; return null } }),
  )
  assert.strictEqual((await rpc.getAccount('addr'))?.owner, 'owner')
  assert.strictEqual(secondaryCalls, 0)
})

test('with a fallback, web3.js silent 429 retries are OFF so failover can engage', () => {
  // Without this a rate-limited primary burns ~15s in web3.js's internal
  // exponential-backoff loop before failoverSolanaRpc ever sees an error.
  const config = solanaConnectionConfig({ chain_id: 'solana:devnet', has_fallback: true })
  assert.strictEqual(config.disableRetryOnRateLimit, true)
})

test('WITHOUT a fallback, the built-in 429 backoff stays on — the only recovery left', () => {
  const config = solanaConnectionConfig({ chain_id: 'solana:devnet', has_fallback: false })
  assert.strictEqual(config.disableRetryOnRateLimit, false)
})

test('connection config carries the recorded commitment policy', () => {
  assert.strictEqual(
    solanaConnectionConfig({ chain_id: 'solana:devnet', has_fallback: true }).commitment,
    'confirmed',
  )
  assert.strictEqual(
    solanaConnectionConfig({ chain_id: 'solana:mainnet', has_fallback: false }).commitment,
    'finalized',
  )
})

test('distinctFallbackUrl: absent and duplicate fallbacks are no failover at all', () => {
  assert.strictEqual(
    distinctFallbackUrl({ rpc_url: 'https://a', rpc_url_fallback: 'https://b' }),
    'https://b',
  )
  assert.strictEqual(distinctFallbackUrl({ rpc_url: 'https://a' }), undefined)
  assert.strictEqual(
    distinctFallbackUrl({ rpc_url: 'https://a', rpc_url_fallback: 'https://a' }),
    undefined,
  )
})

test('per-endpoint timeout tightens only when a DISTINCT fallback exists', () => {
  assert.strictEqual(
    perEndpointTimeoutMs({ rpc_url: 'https://a', rpc_url_fallback: 'https://b' }),
    FALLBACK_RPC_TIMEOUT_MS,
  )
  assert.strictEqual(
    perEndpointTimeoutMs({ rpc_url: 'https://a' }),
    DEFAULT_RPC_TIMEOUT_MS,
  )
  // A fallback that duplicates the primary is no failover at all.
  assert.strictEqual(
    perEndpointTimeoutMs({ rpc_url: 'https://a', rpc_url_fallback: 'https://a' }),
    DEFAULT_RPC_TIMEOUT_MS,
  )
})

test('an explicit timeout override beats the fallback policy', () => {
  assert.strictEqual(
    perEndpointTimeoutMs({ rpc_url: 'https://a', rpc_url_fallback: 'https://b', timeout_ms: 30_000 }),
    30_000,
  )
  assert.strictEqual(perEndpointTimeoutMs({ rpc_url: 'https://a', timeout_ms: 1_000 }), 1_000)
})

test('surfaces the fallback error after both endpoints fail', async () => {
  const fallbackError = new Error('fallback unavailable')
  const rpc = failoverSolanaRpc(
    solRpc({ getTransaction: async () => { throw PRIMARY_ERROR } }),
    solRpc({ getTransaction: async () => { throw fallbackError } }),
  )
  await assert.rejects(rpc.getTransaction('sig'), fallbackError)
})
