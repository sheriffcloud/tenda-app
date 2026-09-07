/**
 * Chain registry for the landing — DERIVED from @tenda/shared CHAIN_MANIFEST
 * (the monorepo's single source of chain truth), so a chain added there shows
 * up across the landing with zero code changes here. Only the MARKETING
 * extras — the one-line pitch and the bare `strength` phrase the copy builds
 * "<chain>'s <strength>" from — live in this file, keyed by manifest `family`.
 * The name, glyph and brand colour come from shared's `chainFamilyDisplay`
 * (#60); everything else is read from the manifest itself.
 */

import {
  CHAIN_FALLBACK_GLYPH,
  CHAIN_MANIFEST,
  chainFamilyDisplay,
  gigAssetByChain,
  nativeCurrencyOf,
  type GasPolicy,
} from '@tenda/shared/chains'
import { ASSET_META } from '@tenda/shared/constants/assets'
import { prose } from '@/lib/prose'

export interface ChainDisplay {
  /** Marketing-cased name (manifest displayName is UPPER for some chains). */
  name: string
  /** Single-character mark used in badges and panels. */
  glyph: string
  /** Chain brand colour — shared's display table is the one place a per-chain hex lives. */
  color: string
  /** One-line positioning used on chain badges / ecosystem panels. */
  pitch: string
  /**
   * The chain's single differentiator as a bare noun phrase, so copy can say
   * "Solana's sub-second settlement" without typing the chain name. Two FAQ
   * sentences and the ecosystems sub-head listed exactly three of these by
   * hand right next to a DERIVED chain list — meaning a fourth chain would
   * have been named in the list and silently missing from the explanation.
   */
  strength: string
}

/**
 * MARKETING extras per manifest family — the pitch and the strength phrase.
 * The name, glyph and brand colour are NOT here any more: they moved to
 * `@tenda/shared` (`chainFamilyDisplay`, #60) so the web app's chain badge
 * and this landing draw the same facts from one table. Add a row when a new
 * family ships.
 */
const FAMILY_MARKETING: Record<string, Pick<ChainDisplay, 'pitch' | 'strength'>> = {
  '0g': {
    pitch: 'The AI-native L1 — where agents come to hire humans.',
    strength: 'AI-native settlement',
  },
  solana: {
    pitch: 'Sub-second settlement, fees too small to notice.',
    strength: 'sub-second settlement',
  },
  base: {
    pitch: 'Coinbase’s L2 — USDC-native, built to onboard everyone.',
    strength: 'USDC-native rails',
  },
  celo: {
    pitch: 'Mobile-first L2 where stablecoins pay their own gas.',
    strength: 'stablecoin-paid gas',
  },
}

export interface LandingChain {
  /** CAIP-2 id, e.g. `eip155:8453`. */
  id: string
  family: string
  name: string
  glyph: string
  color: string
  pitch: string
  /** CAIP-2 namespace — 'solana' | 'eip155'. Decides the wallet transport. */
  namespace: string
  gasPolicy: GasPolicy
  /** Native gas token symbol ('SOL', 'ETH', 'CELO'), from the manifest. */
  nativeSymbol: string
  /** Bare noun phrase for "X's <strength>" copy; '' when undeclared. */
  strength: string
  explorerUrl?: string
}

/**
 * Display extras for a family, with the fallbacks a chain gets when it reaches
 * the MANIFEST before it reaches shared's display table or FAMILY_MARKETING
 * above — which is the supported order: adding a chain is a manifest entry
 * plus secrets, and the display and marketing rows can follow. Exported
 * because that fallback path is the one nobody exercises until the day a
 * chain is added, and an inline object literal inside a .map() cannot be
 * tested before then.
 *
 * `strength` falls back to EMPTY rather than to a guess: copy that builds
 * "<name>'s <strength>" skips a chain with no strength instead of rendering a
 * possessive with nothing after it.
 */
export function displayFor(family: string, displayName: string): ChainDisplay {
  const display = chainFamilyDisplay(family)
  const marketing = Object.hasOwn(FAMILY_MARKETING, family) ? FAMILY_MARKETING[family] : undefined
  return {
    name: display?.name ?? displayName,
    glyph: display?.glyph ?? CHAIN_FALLBACK_GLYPH,
    color: display?.color ?? 'var(--brand-primary)',
    pitch: marketing?.pitch ?? '',
    strength: marketing?.strength ?? '',
  }
}

/**
 * Landing-page chain ORDER: families listed here lead every chain mention on
 * the site, in this order; everything else follows in manifest order. 0G
 * leads — launch positioning, decided 2026-08-27 — so "0G · Solana · Base ·
 * Celo" is what the stamps, prose and panels all derive. A family absent from
 * this list still appears (manifest order, after the led ones), so a new
 * chain never vanishes from marketing by being unlisted here.
 */
const LANDING_FAMILY_ORDER: readonly string[] = ['0g']

function landingRank(family: string): number {
  const at = LANDING_FAMILY_ORDER.indexOf(family)
  return at === -1 ? LANDING_FAMILY_ORDER.length : at
}

/**
 * The chains the landing talks about: every MAINNET manifest entry, 0G first
 * (LANDING_FAMILY_ORDER), then manifest order — Array.prototype.sort is
 * stable, so equal ranks keep their manifest positions. Testnet entries never
 * surface in marketing.
 */
export const LANDING_CHAINS: readonly LandingChain[] = [...CHAIN_MANIFEST]
  .filter((entry) => entry.kind === 'mainnet')
  .sort((a, b) => landingRank(a.family) - landingRank(b.family))
  .map((entry) => ({
    id: entry.id,
    family: entry.family,
    ...displayFor(entry.family, entry.displayName),
    namespace: entry.namespace,
    gasPolicy: entry.gasPolicy,
    nativeSymbol: nativeCurrencyOf(entry).symbol,
    explorerUrl: entry.explorerUrl,
  }))

/** The mainnet chains running a given gas policy, in manifest order. */
export function chainsByGasPolicy(policy: GasPolicy): readonly LandingChain[] {
  return LANDING_CHAINS.filter((c) => c.gasPolicy === policy)
}

/** The distinct gas policies in play across the chains we ship on. */
export const ACTIVE_GAS_POLICIES: readonly GasPolicy[] = [
  ...new Set(LANDING_CHAINS.map((c) => c.gasPolicy)),
]

/** "0G · Solana · Base · Celo" — the recurring network line, for stamps and metas. */
export const CHAIN_NAMES_LINE = LANDING_CHAINS.map((c) => c.name).join(' · ')

/**
 * "0G, Solana, Base and Celo" — the same list as a noun phrase, for running prose
 * (the legal disclaimer, FAQ answers) where middots read as a UI stamp rather
 * than a sentence. Separate from CHAIN_NAMES_LINE so prose and stamps can both
 * be derived instead of one of them being retyped by hand every time a chain
 * is added.
 */
export const CHAIN_NAMES_PROSE = prose(LANDING_CHAINS.map((c) => c.name))

/**
 * Chain names grouped by CAIP-2 namespace, as prose.
 *
 * The wallet story splits on namespace, not on chain: Solana connects through
 * Mobile Wallet Adapter, every eip155 chain through WalletConnect. Deriving
 * the two lists means a new EVM L2 joins the WalletConnect sentence by itself.
 */
export function chainNamesProseByNamespace(namespace: string): string {
  return prose(LANDING_CHAINS.filter((c) => c.namespace === namespace).map((c) => c.name))
}

/**
 * The two CAIP-2 namespaces the product has adapters for. Named once here
 * rather than spelled at each call site: the namespace is what selects the
 * wallet transport, so a string typo would silently produce an empty chain
 * list and a sentence with a hole in it rather than a type error.
 */
const NAMESPACE = { solana: 'solana', evm: 'eip155' } as const

/**
 * How a wallet on this namespace actually connects.
 *
 * The rule was already stated in prose two docstrings above — Solana through
 * Mobile Wallet Adapter, every eip155 chain through WalletConnect — and stating
 * a rule in a comment is how the networks table ended up needing it retyped.
 * It is keyed by NAMESPACE rather than by chain because that is what genuinely
 * decides the transport: a new EVM L2 gets the right answer with no edit here.
 */
const NAMESPACE_TRANSPORT: Readonly<Record<string, string>> = {
  [NAMESPACE.solana]: 'Mobile Wallet Adapter',
  [NAMESPACE.evm]: 'WalletConnect',
}

/**
 * The transport label for a namespace, or '' when we have no adapter for it.
 *
 * Empty rather than a guess, matching how `strength` handles an unknown family:
 * a surface should omit a fact it does not have instead of inventing one that
 * reads as authoritative.
 *
 * OWN properties only. A plain object literal inherits Object.prototype, so
 * `NAMESPACE_TRANSPORT['toString']` is the inherited FUNCTION — truthy, so
 * `?? ''` never fired and this returned a function from a `string` signature.
 * `'constructor'` and `'__proto__'` did the same. No real manifest namespace
 * spells any of those, so nothing shipped wrong; the contract was still false.
 */
export function transportFor(namespace: string): string {
  return Object.hasOwn(NAMESPACE_TRANSPORT, namespace) ? NAMESPACE_TRANSPORT[namespace] : ''
}

/**
 * The explorer's hostname, for link text — 'solscan.io' rather than the full
 * URL with its scheme and trailing path.
 *
 * Parsing is guarded and falls back to the raw string. `new URL()` THROWS on a
 * malformed input, and this value comes from the manifest through to a
 * component's render: an unparseable explorer URL would take down the whole
 * page rather than showing one ugly link. A marketing page has no business
 * being that brittle about a display detail.
 */
export function explorerHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** "Base and Celo" — the EVM chains, for the WalletConnect half of the story. */
export const EVM_CHAIN_NAMES_PROSE = chainNamesProseByNamespace(NAMESPACE.evm)

/** "Solana" — the Mobile Wallet Adapter half of the same story. */
export const SOLANA_CHAIN_NAMES_PROSE = chainNamesProseByNamespace(NAMESPACE.solana)

/**
 * "Solana's sub-second settlement, Base's USDC-native rails and Celo's
 * stablecoin-paid gas" — what each chain is for, as one sentence fragment.
 *
 * A chain with no declared `strength` is SKIPPED rather than rendered as a
 * possessive with nothing after it: a new family that reaches the manifest
 * before it reaches FAMILY_MARKETING should shorten this sentence, not break it.
 */
export const CHAIN_STRENGTHS_PROSE = prose(
  LANDING_CHAINS.filter((c) => c.strength !== '').map((c) => `${c.name}’s ${c.strength}`),
)

/**
 * "USDC, SOL, ETH, cUSD and CELO" — every token the exchange can trade, read
 * off the manifest's `exchange` asset role across the mainnet chains.
 *
 * Deduped BY SYMBOL, not by asset id: USDC exists once per chain as
 * USDC_SOL / USDC_BASE / USDC_CELO, and a reader wants "USDC", not three of
 * them. Listed by hand this said "USDC, SOL or ETH", which quietly omitted
 * Celo's cUSD and CELO — an understatement rather than a lie, and exactly the
 * kind that grows into one when a chain is added.
 *
 * STABLECOINS LEAD, from ASSET_META's own `is_stable` flag rather than a
 * hand-kept order. Raw manifest order puts SOL first (Solana is the first
 * entry and lists its native asset before its USDC), which opens a sentence
 * about a USDC-denominated product with a volatile token.
 */
export const EXCHANGE_ASSET_SYMBOLS_PROSE = prose(
  [
    ...new Map(
      CHAIN_MANIFEST.filter((entry) => entry.kind === 'mainnet')
        .flatMap((entry) => entry.assets.filter((asset) => asset.roles.includes('exchange')))
        .map((asset) => [ASSET_META[asset.id].symbol, ASSET_META[asset.id].is_stable] as const),
    ),
  ]
    .sort(([, aStable], [, bStable]) => Number(bStable) - Number(aStable))
    .map(([symbol]) => symbol),
)

/**
 * The gig asset id per shipped chain, via the shared `gigAssetByChain` — the
 * same accessor the server's `assertGigAsset` guard reads. Gigs are USDC-only,
 * but the ID differs per chain (USDC_SOL / USDC_BASE / USDC_CELO), so copy that
 * needs the asset's DECIMALS must ask a chain rather than name an id.
 *
 * Nulls are filtered rather than defaulted: a chain that carries no gigs is a
 * legitimate manifest state, and inventing an asset for it would be a guess.
 */
export const GIG_ASSET_IDS: readonly string[] = LANDING_CHAINS.map((c) =>
  gigAssetByChain(c.id),
).filter((id): id is string => id !== null)

export function chainByFamily(family: string): LandingChain | undefined {
  return LANDING_CHAINS.find((c) => c.family === family)
}
