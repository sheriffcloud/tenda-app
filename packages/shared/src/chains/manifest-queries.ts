/**
 * Manifest lookups — pure, derived reads over CHAIN_MANIFEST. Kept out of
 * manifest.ts so the data table and its import-time integrity guard stay one
 * focused module. Dependency is strictly one-way: this imports the manifest,
 * never the reverse (manifest.ts holds only the self-contained invariants it
 * needs at import time — isNativeAsset / feeCurrencyAddress).
 */

import { CHAIN_MANIFEST, isNativeAsset, type ChainAsset, type ChainManifestEntry } from './manifest'
import { isEvmChainId } from '../utils/address'
import type { ChainNamespace } from '../db/schema/chains'
import type { ChainRegistryEntry } from '../api/contracts/platform.contract'
import { getAssetMeta } from '../constants/assets'
import { isChainEnabled } from './pause'

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
 * The three PUBLIC facts `GET /v1/platform/chains` publishes per chain (#132 /
 * #137), in wire spelling: the client RPC (through `evmPublicRpcUrl`, the one
 * source for it), the explorer, and where a TESTNET's USDC comes from. Every
 * one is null when the manifest records none — a Solana cluster derives its
 * own RPC and has no explorer entry; a mainnet has no faucet by manifest rule.
 *
 * ONE mapping, because two grew: the server route and the web e2e stub each
 * spelled these three lookups by hand, and a stub that maps a field
 * differently from the route is a fixture claiming a shape the server never
 * sends. Null for an unknown id rather than a throw — the route reaches this
 * only for chains the adapter registry holds, and a stub fixture names ids the
 * manifest may not.
 */
export function chainPublicFacts(id: string): Pick<ChainRegistryEntry, 'rpc_url' | 'explorer_url' | 'faucet_url'> {
  const entry = findChain(id)
  return {
    rpc_url: evmPublicRpcUrl(id),
    explorer_url: entry?.explorerUrl ?? null,
    faucet_url: entry?.faucetUrl ?? null,
  }
}

/**
 * Numeric EVM chain id parsed from the CAIP-2 reference (`eip155:8453` → 8453),
 * the form AppKit/viem network objects use. Throws on a non-EVM or malformed id
 * so a caller can't silently build a network with `id: NaN`.
 */
export function evmChainNumericId(id: string): number {
  // The shape test is `isEvmChainId` in utils/address, which is also what
  // `assertManifestValid` gates every entry on — so for any id that came out of
  // CHAIN_MANIFEST this function is total and callers need no branch of their
  // own. Two copies of the predicate is how one of them would drift.
  if (!isEvmChainId(id)) {
    throw new Error(`chain id '${id}' is not a numeric eip155 CAIP-2 id`)
  }
  return Number(id.split(':')[1])
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
  const asset = nativeAssetOf(entry)
  const meta = getAssetMeta(asset.id)
  // Cannot arise from CHAIN_MANIFEST: `assertManifestValid` runs at module load
  // and refuses any manifest asset missing from ASSET_META. It IS reachable
  // through this signature, which takes an ENTRY a caller can build — the suite
  // exercises exactly that — so this throws rather than assembling a currency
  // out of undefined. Worth the guard because `Record<string, AssetMeta>` used
  // to claim every string key yields metadata, which is how a prototype key
  // ('toString') reached the money helpers as a truthy non-AssetMeta.
  if (meta === null) {
    throw new Error(`chain '${entry.id}': native asset '${asset.id}' missing from ASSET_META`)
  }
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
export function firstEvmChainIdByKind(
  kind: ChainManifestEntry['kind'],
  manifest: readonly ChainManifestEntry[] = CHAIN_MANIFEST,
): string | undefined {
  // Skips a paused chain: this id is stamped into new sign-in messages, and a
  // paused chain is not one a user should be asked to sign on. The manifest is
  // a parameter (defaulted) so the skip can be shown against a paused entry.
  return manifest.find((c) => c.namespace === 'eip155' && c.kind === kind && isChainEnabled(c))?.id
}

/**
 * What to call a chain FAMILY in user-facing copy.
 *
 * Namespaces, not chains: the main-wallet choice is per `chain_ns` (#42), so
 * "your main EVM wallet" covers Base, Celo and 0G at once — which is the
 * honest granularity, because one EVM address signs on all of them.
 *
 * Shared rather than per client, because mobile had a private copy and web had
 * none, so the same choice was named two different things — or not at all — on
 * the two screens that make it.
 */
export const CHAIN_NAMESPACE_LABEL: Record<ChainNamespace, string> = {
  solana: 'Solana',
  eip155: 'EVM',
}

/**
 * Whether an asset can FUND an escrow by signature on its chain — the question
 * an agent has to answer before it posts, and the one the relay refuses with
 * 422 RELAY_UNSUPPORTED_ASSET when the answer is no (#146).
 *
 * ONE predicate, asked by the relay that enforces it and by the registry that
 * publishes it, so the wire can never advertise what the relay denies. Solana
 * is true for every asset: the creator signs the whole transaction and Tenda
 * only pays the fee. EVM needs the token to carry EIP-3009 under its permit
 * domain, both DECLARED on the manifest asset; the relay additionally probes
 * the live token before quoting, so a declaration ahead of a redeploy degrades
 * to the same 422 rather than to an unusable signature. Unknown chain or asset
 * answers false.
 *
 * The manifest is a parameter (defaulted, like `loadChainSecrets`) because the
 * real one declares EIP-3009 on every permit asset, so the permit-only branch
 * could not otherwise be exercised — and a clause no test can reach is one a
 * mutation removes unnoticed.
 */
export function assetFundsBySignature(
  chain_id: string,
  asset_id: string,
  manifest: readonly ChainManifestEntry[] = CHAIN_MANIFEST,
): boolean {
  const chain = manifest.find((c) => c.id === chain_id)
  if (chain === undefined) return false
  if (chain.namespace === 'solana') return chain.assets.some((a) => a.id === asset_id)
  const asset = chain.assets.find((a) => a.id === asset_id)
  return asset !== undefined && asset.eip3009 === true && asset.permit !== undefined
}

/**
 * OBSERVED native gas price per seed-bearing chain, in wei — the fact that
 * turns a gas-seed amount from a guess into a measurement (#53b item 1).
 *
 * Nothing in this repo recorded a 0G gas price before this, which is why the
 * first seed amount was a round placeholder with a comment admitting it. Each
 * entry is a real reading from that chain's public RPC, with the date, so a
 * reviewer can re-take it and see whether it still holds:
 *
 *   eip155:16602 (0G Galileo) — eth_gasPrice returned 4000000007 wei
 *   (~4.0 gwei), identical across three consecutive reads, 2026-09-02.
 *   eip155:16661 (0G mainnet) — eth_gasPrice returned 3892412684 wei
 *   (~3.9 gwei) on https://evmrpc.0g.ai, identical across three consecutive
 *   reads, 2026-09-08 (#77). Mainnet does NOT price above Galileo, so the
 *   amount Galileo's measurement justified carries to mainnet unchanged.
 *
 * Both rounded UP to 5 gwei. The reading is what the chain charges at rest;
 * the grant has to survive the moment it is spent, which is not the moment it
 * was measured.
 *
 * A chain listed here MUST declare `gasSeedAmountRaw`, and the amount must
 * cover the measured lifecycle — both asserted by
 * apps/server/test/integration/evm-gas-budget.anvil.test.ts against the real
 * contract bytecode.
 */
export const OBSERVED_GAS_PRICE_WEI: Readonly<Record<string, bigint>> = {
  'eip155:16602': 5_000_000_000n,
  'eip155:16661': 5_000_000_000n,
}

/**
 * How many full lifecycles a seed should cover.
 *
 * Not 1. A user who can afford exactly one run is stranded by any retry — a
 * dropped transaction, a wallet that resubmits, a gig they accept and unassign
 * — and being one transaction short is exactly as blocking as having nothing,
 * while the difference in cost to us is a fraction of a cent on a testnet and
 * small on 0G. Three is the smallest number that survives an ordinary mishap.
 */
export const GAS_SEED_LIFECYCLE_MULTIPLE = 3n

/**
 * How few grants a seed wallet may be worth before an operator is warned.
 *
 * A count of GRANTS, not a wei floor, because that is the number the decision
 * turns on: "top it up" is worth doing while people can still be paid, and a
 * wei figure means something different on every chain and changes meaning the
 * moment `gasSeedAmountRaw` does.
 *
 * Five. Refunding a hot wallet needs a human with the funding key, and the
 * warning has to outlive the time that takes — a floor of one warns at the same
 * moment the first user is refused, which is not a warning. Low enough that a
 * healthy wallet is silent: a wallet holding five grants has already paid the
 * overwhelming majority of what it was funded for.
 */
export const GAS_SEED_LOW_BALANCE_GRANTS = 5
