/**
 * EVM networks for the Reown AppKit EVM path, as `AppKitNetwork` objects (the
 * native AppKit shape, same fields as the SDK's built-in solana/bitcoin
 * networks).
 *
 * The chains Tenda transacts on are DERIVED from the shared CHAIN_MANIFEST via
 * `evmAppKitNetworks()` — the single derivation web and admin build from too —
 * so adding an EVM chain is a manifest entry plus its secrets, with no edit
 * here. The only literal is Ethereum mainnet, which Tenda never transacts on
 * but registers so a wallet defaulting to Ethereum can still open a session;
 * it is deliberately NOT a manifest chain (a manifest entry would leak its
 * native asset into server-side capability derivations that iterate the whole
 * manifest).
 */
import type { AppKitNetwork } from '@reown/appkit-react-native'
import { evmAppKitNetworks } from '@tenda/shared'

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
 * The annotation is load-bearing: it is a real ASSIGNABILITY check of the
 * shared `EvmAppKitNetwork` shape against this SDK's `AppKitNetwork` (the
 * tuple cast below only checks comparability, which is weaker).
 */
const MANIFEST_NETWORKS: readonly AppKitNetwork[] = evmAppKitNetworks()

/**
 * Non-empty network tuple AppKit's `createAppKit({ networks })` expects. The
 * manifest-derived chains come first (so AppKit's default is a Tenda chain, not
 * Ethereum); the connect-only networks are appended. The assertion is sound: the
 * connect-only list is non-empty, so the array always has a first element.
 */
export const EVM_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [
  ...MANIFEST_NETWORKS,
  ...CONNECT_ONLY_NETWORKS,
] as [AppKitNetwork, ...AppKitNetwork[]]
