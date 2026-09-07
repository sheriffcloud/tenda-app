/** Estimated base transaction fee on Solana (lamports). Used for pre-flight balance checks. */
export const SOLANA_TX_FEE_LAMPORTS = 5_000n

/**
 * Canonical CAIP-2 ids per Solana network — the SINGLE source both the
 * server chain registry and the mobile auth flow resolve through. Note the
 * deliberate asymmetry: the cluster is named 'mainnet-beta' but the CAIP id
 * is 'solana:mainnet' (registry + chains table + assets all key off it);
 * formatting the cluster name directly would produce an id the server
 * never registered.
 */
export const SOLANA_CAIP_BY_NETWORK: Readonly<Record<string, string>> = {
  devnet: 'solana:devnet',
  'mainnet-beta': 'solana:mainnet',
}

/**
 * Resolve a Solana cluster name to its canonical CAIP-2 id. Throws on
 * unknown networks (e.g. 'testnet' — no seeded assets) so a config typo
 * fails loud instead of producing an unregistered chain id.
 */
export function solanaChainId(network: string): string {
  const caip = SOLANA_CAIP_BY_NETWORK[network]
  if (caip === undefined) {
    throw new Error(`unsupported Solana network '${network}' (expected 'devnet' or 'mainnet-beta')`)
  }
  return caip
}

/**
 * Native-SOL asset-registry id per network (mirrors seed-v2). Drives the
 * moderation price-sanity lookup for legacy lamports-denominated gigs.
 */
export const SOLANA_NATIVE_ASSET_BY_NETWORK: Readonly<Record<string, string>> = {
  devnet: 'SOL_DEVNET',
  'mainnet-beta': 'SOL',
}

export function solanaNativeAssetId(network: string): string {
  const id = SOLANA_NATIVE_ASSET_BY_NETWORK[network]
  if (id === undefined) {
    throw new Error(`unsupported Solana network '${network}' (expected 'devnet' or 'mainnet-beta')`)
  }
  return id
}
