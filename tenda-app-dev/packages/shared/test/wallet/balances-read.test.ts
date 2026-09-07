/**
 * readWalletBalances + sumUsdcRaw (ported from mobile's aggregator jest suite
 * when the fan-out moved to shared) plus selectAssets and toBigIntOrNull.
 * Readers are injected — the pluggable-registry seam under test.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  readWalletBalances,
  sumUsdcRaw,
  selectAssets,
  toBigIntOrNull,
  type AssetBalance,
  type BalanceReader,
} from '../../src/wallet'
import type { ChainRegistryEntry } from '../../src/api/contracts/platform.contract'

function evmChain(id: string, name: string): ChainRegistryEntry {
  return {
    id, namespace: 'eip155', display_name: name, escrow_address: '0xEscrow',
    assets: [
      { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
      { id: 'ETH_BASE', symbol: 'ETH', decimals: 18, is_stable: false, token_address: null, supports_permit: false },
    ],
  }
}
const solChain: ChainRegistryEntry = {
  id: 'solana:devnet', namespace: 'solana', display_name: 'Solana Devnet', escrow_address: 'PROGRAM',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false },
    { id: 'SOL_DEVNET', symbol: 'SOL', decimals: 9, is_stable: false, token_address: null, supports_permit: false },
  ],
}

let evmResults: AssetBalance[][] = []
let evmCalls = 0
let solanaCalls = 0
let solanaResult: AssetBalance[] = []
let evmRejects = false

const readers: Record<'solana' | 'eip155', BalanceReader> = {
  eip155: {
    read: async () => {
      evmCalls += 1
      if (evmRejects) throw new Error('rpc down')
      return evmResults.shift() ?? []
    },
  },
  solana: {
    read: async () => {
      solanaCalls += 1
      return solanaResult
    },
  },
}

beforeEach(() => {
  evmResults = []
  evmCalls = 0
  solanaCalls = 0
  solanaResult = []
  evmRejects = false
})

test('fans an EVM wallet over every enabled EVM chain; sums USDC across them', async () => {
  evmResults = [
    [{ assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true }],
    [{ assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '1500000', decimals: 6, isStable: true }],
  ]
  const out = await readWalletBalances(
    [{ chain_ns: 'eip155', address: '0xabc' }],
    [evmChain('eip155:8453', 'Base'), evmChain('eip155:42220', 'Celo')],
    readers,
  )
  assert.strictEqual(out.length, 2)
  assert.deepStrictEqual(out.map((b) => b.displayName).sort(), ['Base', 'Celo'])
  assert.deepStrictEqual(out.map((b) => b.usdc?.amountRaw), ['48500000', '1500000'])
  // 48.5 + 1.5 = 50 USDC → 50_000_000 base units.
  assert.strictEqual(sumUsdcRaw(out), '50000000')
})

test('only pairs wallets with same-namespace chains; picks USDC + native', async () => {
  solanaResult = [
    { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '80000000', decimals: 6, isStable: true },
    { assetId: 'SOL_DEVNET', symbol: 'SOL', amountRaw: '1200000000', decimals: 9, isStable: false },
  ]
  const out = await readWalletBalances(
    [{ chain_ns: 'solana', address: 'SoL' }],
    [solChain, evmChain('eip155:8453', 'Base')],
    readers,
  )
  assert.strictEqual(evmCalls, 0) // no EVM wallet → EVM reader untouched
  assert.strictEqual(solanaCalls, 1)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].usdc?.amountRaw, '80000000')
  assert.strictEqual(out[0].native?.amountRaw, '1200000000')
})

test('sumUsdcRaw is BigInt-exact beyond Number.MAX_SAFE_INTEGER — no float drift', async () => {
  // 2^53 is where Number arithmetic starts silently rounding. Two balances
  // that straddle it must sum to the exact integer, not a float neighbour —
  // this is the "exact base units" claim, pinned where floats would lie.
  const a = (2n ** 53n).toString() // 9007199254740992
  evmResults = [
    [{ assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: a, decimals: 6, isStable: true }],
    [{ assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '3', decimals: 6, isStable: true }],
  ]
  const out = await readWalletBalances(
    [{ chain_ns: 'eip155', address: '0xabc' }],
    [evmChain('eip155:8453', 'Base'), evmChain('eip155:42220', 'Celo')],
    readers,
  )
  // Number(a) + 3 would round to ...994 or ...996; BigInt answers ...995.
  assert.strictEqual(sumUsdcRaw(out), '9007199254740995')
})

test('a reader rejection is dropped, not thrown; sumUsdcRaw of nothing is 0', async () => {
  evmRejects = true
  const out = await readWalletBalances(
    [{ chain_ns: 'eip155', address: '0xabc' }],
    [evmChain('eip155:8453', 'Base')],
    readers,
  )
  assert.deepStrictEqual(out, [])
  assert.strictEqual(sumUsdcRaw(out), '0')
})

test('a chain with NO USDC asset yields a null usdc slot and contributes 0 to the sum', async () => {
  const nativeOnly: ChainRegistryEntry = {
    id: 'eip155:42220', namespace: 'eip155', display_name: 'Celo', escrow_address: '0xE',
    assets: [{ id: 'CELO', symbol: 'CELO', decimals: 18, is_stable: false, token_address: null, supports_permit: false }],
  }
  evmResults = [[{ assetId: 'CELO', symbol: 'CELO', amountRaw: '7', decimals: 18, isStable: false }]]
  const out = await readWalletBalances([{ chain_ns: 'eip155', address: '0xabc' }], [nativeOnly], readers)
  assert.strictEqual(out[0].usdc, null)
  assert.strictEqual(out[0].native?.assetId, 'CELO')
  assert.strictEqual(sumUsdcRaw(out), '0')
})

test('selectAssets: undefined = all assets; a filter narrows; unknown ids are absent', () => {
  const chain = evmChain('eip155:8453', 'Base')
  assert.strictEqual(selectAssets(chain).length, 2)
  assert.deepStrictEqual(selectAssets(chain, ['ETH_BASE']).map((a) => a.id), ['ETH_BASE'])
  assert.deepStrictEqual(selectAssets(chain, ['NOPE']), [])
})

test('toBigIntOrNull: exact integers pass; blank/NaN/decimal-strings are null, not zero', () => {
  assert.strictEqual(toBigIntOrNull('1000000000000000000'), 1000000000000000000n)
  assert.strictEqual(toBigIntOrNull(42.9), 42n) // number form truncates
  assert.strictEqual(toBigIntOrNull(''), null)
  assert.strictEqual(toBigIntOrNull('  '), null)
  assert.strictEqual(toBigIntOrNull('12.5'), null)
  assert.strictEqual(toBigIntOrNull(Number.NaN), null)
  assert.strictEqual(toBigIntOrNull(Number.POSITIVE_INFINITY), null)
})
