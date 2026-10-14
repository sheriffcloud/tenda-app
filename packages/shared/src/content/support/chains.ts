/**
 * The chains the SUPPORT pages talk about — derived from CHAIN_MANIFEST, not
 * typed here, for the reason the landing derives its own list: this copy named
 * three chains while four were live, so 0G shipped to mainnet and every support
 * surface went on saying "Solana, Base and Celo".
 *
 * Same shape as the landing's `LANDING_CHAINS`, deliberately, so the two read
 * as one idea rather than two conventions: a small lead-list, then a stable
 * sort, and a family absent from the lead-list still appears (in manifest
 * order) instead of vanishing from the docs by being unlisted.
 *
 * The ORDER is a product decision (user, 2026-09-10): EVM leads and Celo leads
 * within it, so Solana is never the first chain a reader meets. It is expressed
 * as two rules rather than a hand-written sequence — lead families first, then
 * EVM before Solana — so a new EVM chain slots in ahead of Solana on its own.
 */
import { enabledChains } from '../../chains/pause'
import { nativeCurrencyOf } from '../../chains/manifest-queries'
import { chainFamilyDisplay } from '../../chains/display'
import { prose } from '../../utils/prose'
import type { ChainManifestEntry } from '../../chains/manifest'

/** Families that lead every chain mention on the support pages, in order. */
const SUPPORT_FAMILY_ORDER: readonly string[] = ['celo']

function leadRank(family: string): number {
  const at = SUPPORT_FAMILY_ORDER.indexOf(family)
  return at === -1 ? SUPPORT_FAMILY_ORDER.length : at
}

/** EVM before Solana, so the whole EVM side precedes the Solana side. */
function namespaceRank(entry: ChainManifestEntry): number {
  return entry.namespace === 'eip155' ? 0 : 1
}

export interface SupportChain {
  family: string
  /** Marketing-cased name — the manifest's displayName is UPPER for some. */
  name: string
  /** The token that pays this chain's network fee, e.g. `CELO`. */
  nativeSymbol: string
  /** True when a transaction here can name the token it pays its fee in. */
  paysFeeInToken: boolean
}

/**
 * Every MAINNET chain users may use (a paused chain is not one), in support order. Testnets never surface in copy a
 * reader follows — they would send someone to a network holding no real money.
 * `Array.prototype.sort` is stable, so equal ranks keep manifest order.
 */
export const SUPPORT_CHAINS: readonly SupportChain[] = enabledChains()
  .filter((entry) => entry.kind === 'mainnet')
  .sort((a, b) => leadRank(a.family) - leadRank(b.family) || namespaceRank(a) - namespaceRank(b))
  .map((entry) => ({
    family: entry.family,
    name: chainFamilyDisplay(entry.family)?.name ?? entry.displayName,
    nativeSymbol: nativeCurrencyOf(entry).symbol,
    paysFeeInToken: entry.gasPolicy === 'feeCurrency',
  }))

/** "Celo, Base, 0G and Solana" — the list as a noun phrase, for running copy. */
export const SUPPORT_CHAIN_PROSE = prose(SUPPORT_CHAINS.map((c) => c.name))

/** The EVM half alone: "Celo, Base and 0G" — the wallet guide's card name. */
export const SUPPORT_EVM_CHAIN_PROSE = prose(
  SUPPORT_CHAINS.filter((c) => !isSolana(c)).map((c) => c.name),
)

/** "CELO on Celo, ETH on Base, OG on 0G and SOL on Solana". */
export const SUPPORT_GAS_TOKEN_PROSE = prose(
  SUPPORT_CHAINS.map((c) => `${c.nativeSymbol} on ${c.name}`),
)

/**
 * The chains whose fee a fee-currency-aware wallet can pay in USDC — read off
 * `gasPolicy`, so the sentence that names them cannot outlive the policy.
 */
export const SUPPORT_FEE_CURRENCY_PROSE = prose(
  SUPPORT_CHAINS.filter((c) => c.paysFeeInToken).map((c) => c.name),
)

/**
 * Solana is the one family the support copy splits OUT, because the wallet
 * transport differs there (Mobile Wallet Adapter, not WalletConnect). Keyed on
 * the family rather than the namespace so it reads as the product fact it is.
 */
function isSolana(chain: SupportChain): boolean {
  return chain.family === 'solana'
}
