/**
 * Reown AppKit network objects DERIVED from the manifest — the shape
 * `createAppKit({ networks })` takes in both wallet SDKs (web/admin's
 * `@reown/appkit`, viem-Chain-based, and mobile's `@reown/appkit-react-native`).
 * One derivation here means a new EVM chain is a manifest entry plus its
 * secrets, with zero edits in any client's wallet wiring — the hand-kept
 * per-client network tables this replaces threw at module init when 0G landed
 * in the manifest without a matching row.
 *
 * Shared carries NO wallet-SDK dependency, so the shape is declared
 * structurally. It is deliberately a `type`, not an `interface`: the SDK
 * targets put index signatures on `rpcUrls`/`blockExplorers`, and only
 * object-literal type aliases get TypeScript's implicit index signature —
 * an interface here would fail assignment to both SDKs' `AppKitNetwork`.
 */

import type { ChainManifestEntry } from './manifest'
import { evmChainNumericId, evmManifestEntries, nativeCurrencyOf } from './manifest-queries'

export type EvmAppKitNetwork = {
  id: number
  name: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: { default: { http: readonly string[] } }
  blockExplorers: { default: { name: string; url: string } }
  chainNamespace: 'eip155'
  caipNetworkId: `eip155:${number}`
  testnet: boolean
}

/**
 * Map one EVM manifest entry to the AppKit network shape. Reads the entry's
 * OWN fields (never a manifest lookup by id), so it also derives a network for
 * an entry that is not — or not yet — in CHAIN_MANIFEST; `assertManifestValid`
 * guarantees both URLs on every EVM entry the manifest actually carries, so
 * the throws below are reachable only from a hand-built entry.
 */
export function evmAppKitNetworkOf(entry: ChainManifestEntry): EvmAppKitNetwork {
  const { publicRpcUrl, explorerUrl } = entry
  if (publicRpcUrl === undefined || explorerUrl === undefined) {
    throw new Error(`EVM chain '${entry.id}' is missing publicRpcUrl or explorerUrl`)
  }
  const numericId = evmChainNumericId(entry.id)
  return {
    id: numericId,
    name: entry.displayName,
    nativeCurrency: nativeCurrencyOf(entry),
    rpcUrls: { default: { http: [publicRpcUrl] } },
    // The label is only a link caption in AppKit, not an identifier, so no
    // per-chain brand string.
    blockExplorers: { default: { name: `${entry.displayName} Explorer`, url: explorerUrl } },
    chainNamespace: 'eip155',
    caipNetworkId: `eip155:${numericId}`,
    testnet: entry.kind === 'testnet',
  }
}

/** Every EVM manifest chain as an AppKit network, in manifest order. */
export function evmAppKitNetworks(): EvmAppKitNetwork[] {
  return evmManifestEntries().map(evmAppKitNetworkOf)
}
