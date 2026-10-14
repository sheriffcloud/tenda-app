/**
 * Canonical per-namespace CAIP-2 chain ids for this build (port of
 * apps/mobile/wallet/config.ts). Auth is namespace-scoped: the server
 * verifies the signature for the namespace, not the specific chain, so each
 * namespace needs *a* real registered chain of the right network kind — the
 * manifest's first such entry wins, and adding a chain never edits this file.
 */
import { firstEvmChainIdByKind, solanaChainId } from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared'
import { getEnv } from '@/lib/config/env'

const env = getEnv()

const evmKind = env === 'production' ? 'mainnet' : 'testnet'
const evmChainId = firstEvmChainIdByKind(evmKind)
if (evmChainId === undefined) {
  throw new Error(`no EVM chain of kind '${evmKind}' in CHAIN_MANIFEST`)
}

/**
 * Solana cluster per build env — typed locally (not @solana/web3.js Cluster)
 * so this module never pulls the Solana SDK into the light bundle.
 */
export const SOLANA_NETWORK: 'mainnet-beta' | 'devnet' = env === 'production' ? 'mainnet-beta' : 'devnet'

/**
 * Active CAIP-2 chain id per namespace, the value sent to the server (auth,
 * escrow create). Solana resolves through the shared `solanaChainId` so it
 * matches the server registry EXACTLY ('solana:devnet' / 'solana:mainnet').
 */
export const WALLET_CHAINS: Record<ChainNamespace, string> = {
  solana: solanaChainId(SOLANA_NETWORK),
  eip155: evmChainId,
}
