import type { Cluster } from '@solana/web3.js'
import { solanaChainId, firstEvmChainIdByKind } from '@tenda/shared'
import { getEnv } from '@/lib/env'
import type { ChainNamespace } from '@tenda/shared'

const env = getEnv()

/**
 * The canonical EVM chain id for this build, derived from the manifest by
 * network kind (production → mainnet, otherwise testnet) — the SINGLE EVM id
 * the wallet stamps into an auth message. Auth is namespace-scoped (the server
 * verifies the eip155 signature, not the specific chain), so this only needs to
 * be *a* real EVM chain of the right kind; the manifest's first such entry wins.
 */
const evmKind = env === 'production' ? 'mainnet' : 'testnet'
const evmChainId = firstEvmChainIdByKind(evmKind)
if (evmChainId === undefined) {
  throw new Error(`no EVM chain of kind '${evmKind}' in CHAIN_MANIFEST`)
}

/**
 * SINGLE source for the Solana cluster per build env. Everything that needs
 * the cluster derives from this: the RPC connection (wallet/index.ts), the
 * MWA `chain` param (adapters/mwa-shared.ts), the CAIP id below, and the
 * app-level network the gig/exchange/fiat screens read. Previously this env→
 * cluster decision was duplicated in three places (index.ts, mwa-shared.ts,
 * and, hardcoded wrong, here).
 */
export const SOLANA_NETWORK: Cluster = env === 'production' ? 'mainnet-beta' : 'devnet'

/**
 * Active CAIP-2 chain id per namespace, the value sent to the server (auth,
 * escrow create). Solana resolves through the shared `solanaChainId` so it
 * matches the server registry EXACTLY (`solana:devnet` / `solana:mainnet`, NOT
 * the genesis-hash form, which the registry never registered and which a dev
 * build must never send). EVM derives from the manifest by env kind (see
 * `evmChainId` above) — Base / Base Sepolia today, but adding a chain never
 * edits this file.
 */
export const WALLET_CHAINS: Record<ChainNamespace, string> = {
  solana: solanaChainId(SOLANA_NETWORK),
  eip155: evmChainId, // manifest-derived by env kind (Base / Base Sepolia today)
}

/**
 * App identity surfaced to wallet apps during connect / authorize / sign
 * (MetaMask Connect, Phantom universal links, and, via mwa-shared, MWA,
 * which substitutes a relative icon since it rejects absolute icon URIs).
 */
export const metadata = {
  name: 'Tenda',
  description: 'Tenda multichain self-custodial wallet',
  url: 'https://tendahq.com',
  iconUrl: 'https://tendahq.com/icon.png',
  // Native deeplink wallets bounce back to Tenda via this scheme after approve/sign.
  redirectScheme: 'tenda',
}

/**
 * Deep link WalletConnect wallets return to after approve/sign. Points at the
 * dedicated trampoline route (app/wc-return.tsx) — NOT the bare scheme, which
 * expo-router treats as a navigation to `/` and resets the stack, yanking the
 * user off the screen that launched the wallet round-trip (the TrustWallet
 * "app closed and reopened" report). The trampoline just pops itself.
 */
export const WC_RETURN_URL = `${metadata.redirectScheme}://wc-return`
