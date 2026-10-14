/** Estimated base transaction fee on Solana (lamports). Used for pre-flight balance checks. */
export const SOLANA_TX_FEE_LAMPORTS = 5_000n

/**
 * How long a recent blockhash stays usable (~150 slots at ~400ms). A relayed
 * create quoted on Solana is exactly as fresh as its blockhash, so the terms
 * expire this far after they are issued — an agent that signs slower than
 * this requests fresh terms rather than a durable nonce (not offered).
 */
export const SOLANA_BLOCKHASH_VALIDITY_SECONDS = 60

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
 * Public Solana cluster JSON-RPC endpoint for a canonical CAIP-2 id, or null
 * when the id is not a registered Solana chain. The same URLs
 * @solana/web3.js's `clusterApiUrl` produces, recorded here so fetch-based
 * readers (shared wallet balances) need no web3.js dependency. Client-safe
 * public endpoints only — the server's keyed RPC is a secret.
 */
export function solanaPublicRpcUrl(chainId: string): string | null {
  if (chainId === 'solana:devnet') return 'https://api.devnet.solana.com'
  if (chainId === 'solana:mainnet') return 'https://api.mainnet-beta.solana.com'
  return null
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
