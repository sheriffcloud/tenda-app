import type { ChainRegistryEntry } from '@tenda/shared'

/**
 * Registry entries for the chain-registry store tests — single-sourced so the
 * two suites (behaviour + persistence) cannot drift apart on what a "chain"
 * looks like.
 */
export const SOLANA: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana',
  escrow_address: 'Esc111',
  assets: [
    {
      id: 'USDC_SOL',
      symbol: 'USDC',
      decimals: 6,
      is_stable: true,
      token_address: 'Usdc111',
      supports_permit: false,
    },
  ],
}

/** A second chain, for stale-registry scenarios (SOLANA alone = "stale"). */
export const GALILEO: ChainRegistryEntry = {
  id: 'eip155:16602',
  namespace: 'eip155',
  display_name: '0G Galileo',
  escrow_address: '0xEsc',
  assets: [
    {
      id: 'USDC_0G',
      symbol: 'USDC',
      decimals: 6,
      is_stable: true,
      token_address: '0xUsdc',
      supports_permit: true,
    },
  ],
}
