/**
 * EVM networks for the Reown AppKit EVM path, as `AppKitNetwork` objects (the
 * native AppKit shape, same fields as the SDK's built-in solana/bitcoin
 * networks).
 *
 * The chains Tenda transacts on are DERIVED from the shared CHAIN_MANIFEST — the
 * single source of chain facts — so adding an EVM chain is a manifest entry plus
 * its secrets, with no edit here. The only literal is Ethereum mainnet, which
 * Tenda never transacts on but registers so a wallet defaulting to Ethereum can
 * still open a session; it is deliberately NOT a manifest chain (a manifest
 * entry would leak its native asset into server-side capability derivations that
 * iterate the whole manifest).
 */
import type { AppKitNetwork } from '@reown/appkit-react-native'
import {
  evmManifestEntries,
  evmChainNumericId,
  nativeCurrencyOf,
  requireEvmPublicRpcUrl,
  type ChainManifestEntry,
} from '@tenda/shared'

/** Map a manifest EVM entry to AppKit's native network shape. */
function toAppKitNetwork(entry: ChainManifestEntry): AppKitNetwork {
  const explorerUrl = entry.explorerUrl
  if (explorerUrl === undefined) {
    // Unreachable: assertManifestValid guarantees explorerUrl on every EVM
    // entry, and this only ever runs over evmManifestEntries().
    throw new Error(`EVM chain ${entry.id} has no explorerUrl`)
  }
  return {
    id: evmChainNumericId(entry.id),
    name: entry.displayName,
    nativeCurrency: nativeCurrencyOf(entry),
    rpcUrls: { default: { http: [requireEvmPublicRpcUrl(entry.id)] } },
    // The manifest carries the explorer URL; the label is generic (it is only a
    // link caption in AppKit, not an identifier), so no per-chain brand string.
    // The cast narrows a validated URL string to AppKit's `${string}:${string}`.
    blockExplorers: {
      default: { name: `${entry.displayName} Explorer`, url: explorerUrl as `${string}:${string}` },
    },
    chainNamespace: 'eip155',
    caipNetworkId: entry.id as `${string}:${string}`,
    testnet: entry.kind === 'testnet',
  }
}

/**
 * Connect-only networks: registered so wallets can open a session on them, but
 * NOT chains Tenda transacts on (no escrow, never in the manifest). Ethereum
 * mainnet is here so a wallet defaulting to Ethereum connects without a forced
 * network switch; auth is namespace-scoped so no transaction ever targets it.
 */
const ethereum: AppKitNetwork = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://cloudflare-eth.com'] } },
  blockExplorers: { default: { name: 'Etherscan', url: 'https://etherscan.io' } },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:1',
  testnet: false,
}
const CONNECT_ONLY_NETWORKS: readonly AppKitNetwork[] = [ethereum]

/**
 * Non-empty network tuple AppKit's `createAppKit({ networks })` expects. The
 * manifest-derived chains come first (so AppKit's default is a Tenda chain, not
 * Ethereum); the connect-only networks are appended. The assertion is sound: the
 * connect-only list is non-empty, so the array always has a first element.
 */
export const EVM_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  ...evmManifestEntries().map(toAppKitNetwork),
  ...CONNECT_ONLY_NETWORKS,
] as [AppKitNetwork, ...AppKitNetwork[]]
