/**
 * selectAssets — the shared filter every reader resolves `assetIds` through.
 * Verifies "undefined = all", narrowing, unknown ids dropped rather than
 * faked, and that the caller can't mutate the registry entry through it.
 */
import type { ChainRegistryEntry } from '@tenda/shared'
import { selectAssets } from '@/wallet/balances/select-assets'

const chain: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
    { id: 'ETH_BASE', symbol: 'ETH', decimals: 18, is_stable: false, token_address: null, supports_permit: false },
  ],
}

test('undefined reads every asset on the chain (the wallet-screen fan-out)', () => {
  expect(selectAssets(chain).map((a) => a.id)).toEqual(['USDC_BASE', 'ETH_BASE'])
})

test('narrows to the asked-for asset — one RPC, not one per asset', () => {
  expect(selectAssets(chain, ['ETH_BASE']).map((a) => a.id)).toEqual(['ETH_BASE'])
})

test('an id the chain does not carry is dropped, never invented', () => {
  expect(selectAssets(chain, ['USDC_SOL'])).toEqual([])
})

test('an empty filter reads nothing (not "everything")', () => {
  expect(selectAssets(chain, [])).toEqual([])
})

test('returns a copy — a reader cannot mutate the registry entry', () => {
  const out = selectAssets(chain)
  out.pop()
  expect(chain.assets).toHaveLength(2)
})
