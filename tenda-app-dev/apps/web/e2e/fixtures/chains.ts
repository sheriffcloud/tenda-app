/**
 * The chain registry the stub deployment SERVES — dev chains only.
 *
 * Two consumers, and they must agree: `GET /v1/platform/chains` answers this
 * list, and the browse routes refuse a `chain_id` outside it exactly as
 * `lib/chain-filter.ts` does. A stub that offered one set and accepted another
 * would let a client forward an id the real server would reject.
 */
import type { ChainRegistryEntry } from '@tenda/shared'

/** The RUNNING registry: dev chains only — the filter must offer exactly these. */
export const ENABLED_CHAINS: ChainRegistryEntry[] = [
  {
    id: 'solana:devnet',
    namespace: 'solana',
    display_name: 'Solana Devnet',
    escrow_address: 'Escrw111111111111111111111111111111111111111',
    assets: [
      { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'Mint1111', supports_permit: false },
    ],
  },
  {
    id: 'eip155:84532',
    namespace: 'eip155',
    display_name: 'Base Sepolia',
    escrow_address: '0x000000000000000000000000000000000000e5c1',
    assets: [
      { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xusdc', supports_permit: true },
    ],
  },
]

export const ENABLED_CHAIN_IDS: readonly string[] = ENABLED_CHAINS.map((chain) => chain.id)
