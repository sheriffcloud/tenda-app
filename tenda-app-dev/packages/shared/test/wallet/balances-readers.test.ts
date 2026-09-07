/**
 * The fetch-based readers against a stubbed global fetch: exact JSON-RPC
 * bodies (eth_getBalance vs balanceOf eth_call; getBalance vs jsonParsed
 * getTokenAccountsByOwner with account summing), per-asset failure omission,
 * and the no-RPC-URL guard. Chain ids resolve through the REAL manifest /
 * solanaPublicRpcUrl — the same single-source the clients use.
 */
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert'
import { evmBalanceReader, solanaBalanceReader } from '../../src/wallet'
import { evmPublicRpcUrl } from '../../src/chains/manifest-queries'
import type { ChainRegistryEntry } from '../../src/api/contracts/platform.contract'

interface CapturedCall {
  url: string
  body: { method: string; params: unknown[] }
}

const calls: CapturedCall[] = []
let responder: (body: { method: string; params: unknown[] }) => unknown

const realFetch = globalThis.fetch
function stubFetch(): void {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] }
    calls.push({ url: String(url), body })
    return new Response(JSON.stringify(responder(body)), {
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
}
after(() => {
  globalThis.fetch = realFetch
})

beforeEach(() => {
  calls.length = 0
  stubFetch()
})

const EVM_CHAIN: ChainRegistryEntry = {
  id: 'eip155:84532', namespace: 'eip155', display_name: 'Base Sepolia', escrow_address: '0xE',
  assets: [
    { id: 'USDC_BASE_SEPOLIA', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0x' + 'a'.repeat(40), supports_permit: true },
    { id: 'ETH_BASE_SEPOLIA', symbol: 'ETH', decimals: 18, is_stable: false, token_address: null, supports_permit: false },
  ],
}
const SOL_CHAIN: ChainRegistryEntry = {
  id: 'solana:devnet', namespace: 'solana', display_name: 'Solana Devnet', escrow_address: 'P',
  assets: [
    { id: 'USDC_SOL_DEV', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MintAddr', supports_permit: false },
    { id: 'SOL_DEVNET', symbol: 'SOL', decimals: 9, is_stable: false, token_address: null, supports_permit: false },
  ],
}

test('evm: native via eth_getBalance, token via balanceOf eth_call, hex → decimal', async () => {
  responder = (body) => ({
    jsonrpc: '2.0', id: 1,
    result: body.method === 'eth_getBalance' ? '0xde0b6b3a7640000' : '0x2faf080', // 1 ETH / 50 USDC
  })
  const out = await evmBalanceReader.read('0x' + 'b'.repeat(40), EVM_CHAIN)

  assert.deepStrictEqual(
    out.map((b) => [b.assetId, b.amountRaw]).sort(),
    [['ETH_BASE_SEPOLIA', '1000000000000000000'], ['USDC_BASE_SEPOLIA', '50000000']].sort(),
  )
  // Every call went to the manifest's public RPC for this chain.
  const rpcUrl = evmPublicRpcUrl('eip155:84532')
  assert.ok(rpcUrl !== null)
  assert.ok(calls.every((c) => c.url === rpcUrl))
  const ethCall = calls.find((c) => c.body.method === 'eth_call')
  assert.ok(ethCall, 'expected a balanceOf eth_call')
  const [callArg] = ethCall.body.params as [{ to: string; data: string }]
  assert.strictEqual(callArg.to, EVM_CHAIN.assets[0].token_address)
  assert.match(callArg.data, /^0x70a08231/) // balanceOf selector
  assert.ok(callArg.data.toLowerCase().includes('b'.repeat(40))) // padded holder address
})

test('evm: one asset\'s failed RPC is omitted; the other survives (allSettled)', async () => {
  responder = (body) => {
    if (body.method === 'eth_call') throw new Error('token RPC down')
    return { jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' }
  }
  const out = await evmBalanceReader.read('0x' + 'b'.repeat(40), EVM_CHAIN)
  assert.deepStrictEqual(out.map((b) => b.assetId), ['ETH_BASE_SEPOLIA'])
})

test('solana: a non-numeric getBalance answer omits SOL but keeps the token read', async () => {
  responder = (body) =>
    body.method === 'getBalance'
      ? { result: { value: 'not-a-number' } }
      : {
          result: {
            value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '5' } } } } } }],
          },
        }
  const out = await solanaBalanceReader.read('SoLOwner', SOL_CHAIN)
  assert.deepStrictEqual(out.map((b) => [b.assetId, b.amountRaw]), [['USDC_SOL_DEV', '5']])
})

/**
 * The conflation the wallet surfaces exist to prevent (#64). An HTTP 200
 * carrying a JSON-RPC error object is not an exception: nothing rejects, so
 * before the fix the asset arrived with a real-looking zero and the grid
 * printed 0.00 for a chain it had failed to read.
 */
test('evm: a JSON-RPC error body omits the asset — it is not a zero balance', async () => {
  responder = () => ({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limited' } })

  const balances = await evmBalanceReader.read('0xabc', EVM_CHAIN)

  assert.deepStrictEqual(balances, [], 'a node that refused to answer must yield NO reading')
})

test('evm: a real zero balance still reads as zero, and is not omitted', async () => {
  // The other half, in the same shape: `0x0` is an answer. Only a missing one
  // is dropped, or the fix would hide empty wallets instead of failed reads.
  responder = () => ({ jsonrpc: '2.0', id: 1, result: '0x0' })

  const balances = await evmBalanceReader.read('0xabc', EVM_CHAIN)

  assert.strictEqual(balances.length, 2)
  assert.deepStrictEqual(balances.map((b) => b.amountRaw), ['0', '0'])
})

test('evm: an eth_call answering 0x omits the token but keeps the native read', async () => {
  // `0x` from eth_call is the contract declining to answer — reverted, or no
  // code at that address. eth_getBalance never answers it, so the native asset
  // still reads normally and proves the omission is per-asset.
  responder = (body) =>
    body.method === 'eth_call'
      ? { jsonrpc: '2.0', id: 1, result: '0x' }
      : { jsonrpc: '2.0', id: 1, result: '0xde0b6b3a7640000' }

  const balances = await evmBalanceReader.read('0xabc', EVM_CHAIN)

  assert.deepStrictEqual(balances.map((b) => b.symbol), ['ETH'])
  assert.strictEqual(balances[0].amountRaw, '1000000000000000000')
})

test('evm: a body with no result key at all omits the asset', async () => {
  // Not every non-answer carries an `error` object — a proxy or a misbehaving
  // node can return an envelope with neither.
  responder = () => ({ jsonrpc: '2.0', id: 1 })

  assert.deepStrictEqual(await evmBalanceReader.read('0xabc', EVM_CHAIN), [])
})

test('evm: an unknown chain id (no manifest RPC) reads as no balances, no calls', async () => {
  responder = () => ({ result: '0x0' })
  const out = await evmBalanceReader.read('0xabc', { ...EVM_CHAIN, id: 'eip155:999999' })
  assert.deepStrictEqual(out, [])
  assert.strictEqual(calls.length, 0)
})

test('solana: lamports via getBalance, SPL via jsonParsed getTokenAccountsByOwner (summed)', async () => {
  responder = (body) =>
    body.method === 'getBalance'
      ? { result: { value: 1200000000 } }
      : {
          result: {
            value: [
              { account: { data: { parsed: { info: { tokenAmount: { amount: '30000000' } } } } } },
              { account: { data: { parsed: { info: { tokenAmount: { amount: '20000000' } } } } } },
            ],
          },
        }
  const out = await solanaBalanceReader.read('SoLOwner', SOL_CHAIN)

  assert.deepStrictEqual(
    out.map((b) => [b.assetId, b.amountRaw]).sort(),
    [['SOL_DEVNET', '1200000000'], ['USDC_SOL_DEV', '50000000']].sort(),
  )
  assert.ok(calls.every((c) => c.url === 'https://api.devnet.solana.com'))
  const tokenCall = calls.find((c) => c.body.method === 'getTokenAccountsByOwner')
  assert.ok(tokenCall)
  // 'confirmed' pinned on BOTH methods — mobile's web3.js Connection reads at
  // confirmed, and the raw-RPC default (finalized) would lag it by ~30s.
  assert.deepStrictEqual(tokenCall.body.params, [
    'SoLOwner',
    { mint: 'MintAddr' },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ])
  const balanceCall = calls.find((c) => c.body.method === 'getBalance')
  assert.ok(balanceCall)
  assert.deepStrictEqual(balanceCall.body.params, ['SoLOwner', { commitment: 'confirmed' }])
})

test('solana: one malformed asset answer is omitted; the other survives', async () => {
  responder = (body) =>
    body.method === 'getBalance' ? { result: { value: 7 } } : { error: { message: 'bad owner' } }
  const out = await solanaBalanceReader.read('SoLOwner', SOL_CHAIN)
  assert.deepStrictEqual(out.map((b) => b.assetId), ['SOL_DEVNET'])
  assert.strictEqual(out[0].amountRaw, '7')
})

test('solana: a non-solana chain id reads as no balances, no calls', async () => {
  responder = () => ({})
  const out = await solanaBalanceReader.read('SoLOwner', { ...SOL_CHAIN, id: 'solana:testnet' })
  assert.deepStrictEqual(out, [])
  assert.strictEqual(calls.length, 0)
})
