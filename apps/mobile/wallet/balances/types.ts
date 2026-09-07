import type { ChainNamespace, ChainRegistryEntry } from '@tenda/shared'

/** A single asset's balance on one chain, in base units (string for exactness). */
export interface AssetBalance {
  assetId: string
  symbol: string
  /** Base-unit amount (lamports / wei / token base units) as a decimal string. */
  amountRaw: string
  decimals: number
  isStable: boolean
}

/**
 * Reads on-chain balances for one wallet on one chain. Implemented per
 * namespace (solana / eip155) and registered in `READERS`, adding a chain
 * family is one new reader, no call-site change (the "pluggable" requirement).
 *
 * `assetIds` narrows the read to specific assets (omit for all of them); every
 * reader resolves it through the shared `selectAssets` helper. A read that
 * fails for one asset omits that asset rather than rejecting the whole call.
 */
export interface BalanceReader {
  read(
    address: string,
    chain: ChainRegistryEntry,
    assetIds?: readonly string[],
  ): Promise<AssetBalance[]>
}

/** A wallet's balance on a specific chain, as surfaced to the wallet screen. */
export interface WalletChainBalance {
  chainId: string
  namespace: ChainNamespace
  displayName: string
  address: string
  /** The chain's gig stablecoin (USDC), if the wallet holds any / it exists. */
  usdc: AssetBalance | null
  /** The chain's native gas token (SOL / ETH / CELO). */
  native: AssetBalance | null
}
