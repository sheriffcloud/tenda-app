import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  DEFAULT_RPC_TIMEOUT_MS,
  FALLBACK_RPC_TIMEOUT_MS,
  createSolanaRpc,
  distinctFallbackUrl,
  failoverSolanaRpc,
  perEndpointTimeoutMs,
  solanaConnectionConfig,
  solanaRpcFromConnection,
  type SolanaConnectionPort,
  type SolanaRpc,
} from '@server/chains/solana/rpc'
import bs58 from 'bs58'
import { startStubRpc } from '../helpers/stub-rpc'

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
  const rpc = failoverSolanaRpc([
    solRpc({ getTransaction: async () => { throw PRIMARY_ERROR } }),
    solRpc({ getTransaction: async () => { secondaryCalls += 1; return null } }),
  ])
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
  const rpc = failoverSolanaRpc([solRpc({
    getLatestBlockhash: fail,
    getTransaction: fail,
    getAccount: fail,
    getSignaturesForAddress: fail,
  }), secondary])

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
  const rpc = failoverSolanaRpc([
    solRpc({ getAccount: async () => ({ data: Buffer.from('ok'), owner: 'owner' }) }),
    solRpc({ getAccount: async () => { secondaryCalls += 1; return null } }),
  ])
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

test('when every endpoint fails, EVERY read method surfaces BOTH causes in endpoint order', async () => {
  const fallbackError = new Error('fallback unavailable')
  const failing = (cause: Error): SolanaRpc => {
    const fail = async (): Promise<never> => { throw cause }
    return solRpc({
      getLatestBlockhash: fail,
      getTransaction: fail,
      getAccount: fail,
      getSignaturesForAddress: fail,
    })
  }
  const rpc = failoverSolanaRpc([failing(PRIMARY_ERROR), failing(fallbackError)])
  const reads = {
    getLatestBlockhash: () => rpc.getLatestBlockhash(),
    getTransaction: () => rpc.getTransaction('sig'),
    getAccount: () => rpc.getAccount('addr'),
    getSignaturesForAddress: () => rpc.getSignaturesForAddress('program', { limit: 1 }),
  }
  for (const [name, read] of Object.entries(reads)) {
    await assert.rejects(read(), (e: unknown) =>
      e instanceof AggregateError && e.errors.length === 2 && e.errors[0] === PRIMARY_ERROR && e.errors[1] === fallbackError,
    `${name} must surface both causes`)
  }
})

test('a third endpoint is reached after the first two fail, and nothing after the first success', async () => {
  const order: string[] = []
  const failing = (name: string): SolanaRpc =>
    solRpc({ getAccount: async () => { order.push(name); throw new Error(name) } })
  const rpc = failoverSolanaRpc([
    failing('a'),
    failing('b'),
    solRpc({ getAccount: async () => { order.push('c'); return { data: Buffer.from('ok'), owner: 'c-owner' } } }),
    solRpc({ getAccount: async () => { order.push('d'); return null } }),
  ])
  assert.strictEqual((await rpc.getAccount('addr'))?.owner, 'c-owner')
  assert.deepStrictEqual(order, ['a', 'b', 'c'])
})

test('a single endpoint keeps its OWN error type, untouched by the combinator', async () => {
  const only = new RangeError('lone endpoint down')
  const rpc = failoverSolanaRpc([solRpc({ getSignaturesForAddress: async () => { throw only } })])
  await assert.rejects(rpc.getSignaturesForAddress('program', { limit: 1 }), only)
})

test('a HUNG endpoint fails over: each endpoint carries its own timeout, so the combinator needs none', async () => {
  // The reason failoverSolanaRpc passes no timeout_ms. A degraded provider
  // usually never answers; if the per-endpoint bound were missing, the loop
  // would wait on the primary forever and never reach the second endpoint.
  const port = (over: Partial<SolanaConnectionPort>): SolanaConnectionPort => ({
    getLatestBlockhash: async () => ({ blockhash: 'BH', lastValidBlockHeight: 1 }),
    getTransaction: async () => null,
    getAccountInfo: async () => null,
    getSignaturesForAddress: async () => [],
    ...over,
  })
  const never = <T>(): Promise<T> => new Promise<T>(() => undefined)
  const rpc = failoverSolanaRpc([
    solanaRpcFromConnection(port({ getLatestBlockhash: never }), 40),
    solanaRpcFromConnection(port({ getLatestBlockhash: async () => ({ blockhash: 'second', lastValidBlockHeight: 9 }) }), 40),
  ])
  assert.deepStrictEqual(await rpc.getLatestBlockhash(), { blockhash: 'second', last_valid_block_height: 9 })
})

// ---------- createSolanaRpc: the factory that wires the endpoints ------------

const BLOCKHASH_REPLY = {
  context: { slot: 1 },
  value: { blockhash: 'GfnhkAa2iy8cZV7X5SyyYmWDjA3rGg9Q7bX9ZpzG8m1u', lastValidBlockHeight: 321 },
}

test('createSolanaRpc: a failing primary fails over to the configured fallback', async () => {
  const primary = await startStubRpc((m) => {
    if (m === 'getLatestBlockhash') throw new Error('primary is down')
    return null
  })
  const secondary = await startStubRpc((m) => (m === 'getLatestBlockhash' ? BLOCKHASH_REPLY : null))
  try {
    const rpc = createSolanaRpc({
      rpc_url: primary.url,
      rpc_url_fallback: secondary.url,
      chain_id: 'solana:devnet',
    })
    assert.deepStrictEqual(await rpc.getLatestBlockhash(), {
      blockhash: BLOCKHASH_REPLY.value.blockhash,
      last_valid_block_height: 321,
    })
    assert.strictEqual(primary.callsTo('getLatestBlockhash').length, 1, 'the primary is tried first')
    assert.strictEqual(secondary.callsTo('getLatestBlockhash').length, 1, 'the fallback answers')
  } finally {
    await primary.close()
    await secondary.close()
  }
})

test('createSolanaRpc: with no fallback the failure is the endpoint\'s own, tried once', async () => {
  const primary = await startStubRpc((m) => {
    if (m === 'getLatestBlockhash') throw new Error('primary is down')
    return null
  })
  try {
    const rpc = createSolanaRpc({ rpc_url: primary.url, chain_id: 'solana:devnet' })
    await assert.rejects(rpc.getLatestBlockhash(), (e: unknown) => !(e instanceof AggregateError))
    assert.strictEqual(primary.callsTo('getLatestBlockhash').length, 1)
  } finally {
    await primary.close()
  }
})

test('createSolanaRpc: a fallback that duplicates the primary is not a second attempt', async () => {
  const primary = await startStubRpc((m) => {
    if (m === 'getLatestBlockhash') throw new Error('primary is down')
    return null
  })
  try {
    const rpc = createSolanaRpc({
      rpc_url: primary.url,
      rpc_url_fallback: primary.url,
      chain_id: 'solana:devnet',
    })
    await assert.rejects(rpc.getLatestBlockhash())
    assert.strictEqual(primary.callsTo('getLatestBlockhash').length, 1)
  } finally {
    await primary.close()
  }
})

test('createSolanaRpc: when both endpoints fail the caller gets both causes', async () => {
  const down = (m: string): unknown => {
    if (m === 'getLatestBlockhash') throw new Error('down')
    return null
  }
  const primary = await startStubRpc(down)
  const secondary = await startStubRpc(down)
  try {
    const rpc = createSolanaRpc({ rpc_url: primary.url, rpc_url_fallback: secondary.url, chain_id: 'solana:devnet' })
    await assert.rejects(rpc.getLatestBlockhash(), (e: unknown) => e instanceof AggregateError && e.errors.length === 2)
  } finally {
    await primary.close()
    await secondary.close()
  }
})

// ---------- createSolanaRpc: what each read maps the cluster's answer to -----

const KEY = '11111111111111111111111111111111'
const SIGNATURE = bs58.encode(Buffer.alloc(64, 3))

/** The smallest transaction web3.js's response validation accepts. */
const transactionReply = (err: unknown, logMessages: string[] | null) => ({
  slot: 5,
  blockTime: null,
  meta: { err, fee: 5000, preBalances: [1], postBalances: [1], logMessages },
  transaction: {
    signatures: [SIGNATURE],
    message: {
      accountKeys: [KEY],
      header: { numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0, numRequiredSignatures: 1 },
      instructions: [],
      recentBlockhash: KEY,
    },
  },
})

async function rpcOver(respond: (method: string) => unknown) {
  const node = await startStubRpc(respond)
  return { node, rpc: createSolanaRpc({ rpc_url: node.url, chain_id: 'solana:devnet' }) }
}

test('createSolanaRpc maps a landed transaction to failed=false with its logs', async () => {
  const { node, rpc } = await rpcOver((m) => (m === 'getTransaction' ? transactionReply(null, ['Program log: ok']) : null))
  try {
    assert.deepStrictEqual(await rpc.getTransaction(SIGNATURE), {
      failed: false,
      failure_reason: null,
      log_messages: ['Program log: ok'],
    })
    // The recorded commitment policy rides the read: devnet 'confirmed', and
    // versioned transactions are asked for explicitly (web3 refuses them otherwise).
    assert.deepStrictEqual(node.callsTo('getTransaction')[0].params[1], {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
  } finally {
    await node.close()
  }
})

test('createSolanaRpc on MAINNET reads transactions at the stricter commitment: finalized', async () => {
  // The recorded policy: devnet accepts 'confirmed', mainnet requires
  // 'finalized' — a mainnet transaction must not be acted on before it can no
  // longer be rolled back.
  const node = await startStubRpc((m) => (m === 'getTransaction' ? transactionReply(null, []) : null))
  try {
    const rpc = createSolanaRpc({ rpc_url: node.url, chain_id: 'solana:mainnet' })
    await rpc.getTransaction(SIGNATURE)
    assert.deepStrictEqual(node.callsTo('getTransaction')[0].params[1], {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    })
  } finally {
    await node.close()
  }
})

test('createSolanaRpc maps a FAILED transaction to failed=true with the runtime error, and missing logs to []', async () => {
  const { node, rpc } = await rpcOver((m) => (m === 'getTransaction' ? transactionReply({ InstructionError: [0, 'Custom'] }, null) : null))
  try {
    const tx = await rpc.getTransaction(SIGNATURE)
    assert.strictEqual(tx?.failed, true)
    assert.strictEqual(tx?.failure_reason, JSON.stringify({ InstructionError: [0, 'Custom'] }))
    assert.deepStrictEqual(tx?.log_messages, [])
  } finally {
    await node.close()
  }
})

test('createSolanaRpc: an unknown signature is null, not an error', async () => {
  const { node, rpc } = await rpcOver(() => null)
  try {
    assert.strictEqual(await rpc.getTransaction(SIGNATURE), null)
  } finally {
    await node.close()
  }
})

test('createSolanaRpc maps an account to its data and its OWNING program, and a missing one to null', async () => {
  const { node, rpc } = await rpcOver((m) =>
    m === 'getAccountInfo'
      ? { context: { slot: 1 }, value: { data: [Buffer.from('hello').toString('base64'), 'base64'], executable: false, lamports: 1, owner: KEY, rentEpoch: 0 } }
      : null,
  )
  const empty = await rpcOver(() => ({ context: { slot: 1 }, value: null }))
  try {
    const account = await rpc.getAccount(KEY)
    assert.strictEqual(account?.owner, KEY)
    assert.strictEqual(account?.data.toString(), 'hello')
    assert.strictEqual(await empty.rpc.getAccount(KEY), null)
  } finally {
    await node.close()
    await empty.node.close()
  }
})

test('createSolanaRpc maps the signature feed to {signature, slot} pairs, passing the limit through', async () => {
  const { node, rpc } = await rpcOver((m) =>
    m === 'getSignaturesForAddress' ? [{ signature: SIGNATURE, slot: 9, err: null, memo: null, blockTime: null }] : null,
  )
  try {
    assert.deepStrictEqual(await rpc.getSignaturesForAddress(KEY, { limit: 7 }), [{ signature: SIGNATURE, slot: 9 }])
    const [call] = node.callsTo('getSignaturesForAddress')
    // web3 adds the connection's commitment (devnet: 'confirmed') to the config.
    assert.deepStrictEqual(call.params[1], { commitment: 'confirmed', limit: 7 })
  } finally {
    await node.close()
  }
})
