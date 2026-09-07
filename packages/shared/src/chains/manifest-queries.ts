/**
 * Manifest lookups — pure, derived reads over CHAIN_MANIFEST. Kept out of
 * manifest.ts so the data table and its import-time integrity guard stay one
 * focused module. Dependency is strictly one-way: this imports the manifest,
 * never the reverse (manifest.ts holds only the self-contained invariants it
 * needs at import time — isNativeAsset / feeCurrencyAddress).
 */

import { CHAIN_MANIFEST, isNativeAsset, type ChainAsset, type ChainManifestEntry } from './manifest'
import { ASSET_META } from '../constants/assets'

/** Look up a chain by CAIP-2 id; throws on unknown so callers fail loud. */
export function chainById(id: string): ChainManifestEntry {
  const entry = CHAIN_MANIFEST.find((c) => c.id === id)
  if (entry === undefined) {
    throw new Error(`unknown chain id '${id}' (not in CHAIN_MANIFEST)`)
  }
  return entry
}

/** Non-throwing lookup for membership checks. */
export function findChain(id: string): ChainManifestEntry | undefined {
  return CHAIN_MANIFEST.find((c) => c.id === id)
}

/**
 * The gig-eligible (USDC) asset id for a chain, or null if the chain carries
 * no gigs. Derived from the asset list — the SINGLE source of the gig-asset
 * policy (the server's assertGigAsset and the mobile chain picker both read it).
 */
export function gigAssetByChain(id: string): string | null {
  return findChain(id)?.assets.find((a) => a.roles.includes('gig'))?.id ?? null
}

/**
 * Exchange-tradable asset ids for a chain (USDC + the native token, per the
 * manifest roles), or an empty list for an unknown chain. SINGLE source shared
 * by the server's assertExchangeAsset guard and the mobile asset picker, so
 * client options and the guard can never disagree.
 */
export function exchangeAssetsByChain(id: string): string[] {
  return findChain(id)?.assets.filter((a) => a.roles.includes('exchange')).map((a) => a.id) ?? []
}

/**
 * Client-safe public RPC URL for an EVM chain id, or null if unknown / non-EVM.
 * The single source for client-side balance reads — callers must not hardcode
 * RPC endpoints. Non-throwing (a registry chain with no manifest match simply
 * yields no reads rather than crashing the screen).
 */
export function evmPublicRpcUrl(id: string): string | null {
  return findChain(id)?.publicRpcUrl ?? null
}

/** Throwing variant for call sites that require the URL (manifest guarantees it). */
export function requireEvmPublicRpcUrl(id: string): string {
  const url = evmPublicRpcUrl(id)
  if (url === null) {
    throw new Error(`no publicRpcUrl for EVM chain '${id}' (not in CHAIN_MANIFEST)`)
  }
  return url
}

/**
 * Numeric EVM chain id parsed from the CAIP-2 reference (`eip155:8453` → 8453),
 * the form AppKit/viem network objects use. Throws on a non-EVM or malformed id
 * so a caller can't silently build a network with `id: NaN`.
 */
export function evmChainNumericId(id: string): number {
  const [ns, ref] = id.split(':')
  // Decimal digits only — `Number('0x1')` would otherwise coerce to 1 and let a
  // malformed reference through. CAIP-2 eip155 references are base-10.
  if (ns !== 'eip155' || ref === undefined || !/^[0-9]+$/.test(ref) || Number(ref) <= 0) {
    throw new Error(`chain id '${id}' is not a numeric eip155 CAIP-2 id`)
  }
  return Number(ref)
}

/**
 * The chain's native gas token asset (the one with no contract and no secret).
 * The manifest guarantees exactly one (assertManifestValid), so this throws
 * rather than returning undefined — an absent native asset is a manifest bug.
 */
export function nativeAssetOf(entry: ChainManifestEntry): ChainAsset {
  const native = entry.assets.find(isNativeAsset)
  if (native === undefined) {
    throw new Error(`chain '${entry.id}' has no native asset (violates the manifest invariant)`)
  }
  return native
}

/**
 * Native-currency display metadata for a chain, assembled from its native asset
 * + ASSET_META — the shape an EVM network's `nativeCurrency` needs. `name` falls
 * back to the symbol when the asset omits the long form.
 */
export function nativeCurrencyOf(entry: ChainManifestEntry): {
  name: string
  symbol: string
  decimals: number
} {
  const meta = ASSET_META[nativeAssetOf(entry).id]
  return { name: meta.name ?? meta.symbol, symbol: meta.symbol, decimals: meta.decimals }
}

/** All EVM (eip155) manifest entries, in manifest order. */
export function evmManifestEntries(): ChainManifestEntry[] {
  return CHAIN_MANIFEST.filter((c) => c.namespace === 'eip155')
}

/**
 * The canonical EVM chain id for a network kind (`mainnet`/`testnet`), first by
 * manifest order — the single namespace-scoped id the mobile wallet stamps into
 * an auth message (which the server verifies by namespace only, so the specific
 * chain is not load-bearing). Undefined when no EVM chain of that kind exists.
 */
export function firstEvmChainIdByKind(kind: ChainManifestEntry['kind']): string | undefined {
  return evmManifestEntries().find((c) => c.kind === kind)?.id
}
