/**
 * §01 Hero copy. The headline is a brand fixture — do not reword casually.
 * Stat row pulls live values from /v1/platform/config when available;
 * `HERO_STATS_FALLBACK` only renders if the API call fails or is in flight.
 */

import { APP_INFO, EXAMPLE_ESCROW, FEE_PCT, TRADE_MARKET_COUNT } from '@/content'

export interface HeroStat {
  value: string
  label: string
}

export const HERO_CONTENT = {
  stamps: {
    versionLabel: `${APP_INFO.versionNumber} · ${APP_INFO.chains.stage}`,
    /**
     * "Built for", not "Live on" — the single most prominent claim on the page
     * and, until this change, the falsest: it announced four live chains
     * directly above a hero for a build whose contracts were all on testnet.
     * The stage stamp beside it already says which network this release talks
     * to, so the honest split is chains here, status there.
     */
    liveLabel: `Built for ${APP_INFO.chains.networksLine}`,
  },
  /** The brand line, minus its period — the page draws that in brand blue. */
  h1: APP_INFO.tagline.replace(/\.$/, ''),
  /**
   * ONE lede, as the Paper Landing sets it. It was a two-paragraph "ribbon"
   * with a rule between; the artifact runs it as a single paragraph and the
   * port follows the artifact's wording exactly.
   */
  lede: 'The money locks in an on-chain escrow the moment a gig posts or an offer goes live. Nobody holds your funds — not us, not the counterparty, not an exchange. Proof releases. The contract settles.',
  /**
   * The web app leads, the APK follows (2026-09-01). The label for the primary
   * lives in `nav-content.ts` as WEB_APP_LINK so the two CTAs cannot disagree.
   */
  cta: {
    secondary: 'Download for Android',
  },
  /** Caption under the hero's escrow receipt. */
  deckCaption: 'Example escrow · every figure derives from the platform fee',
} as const

/**
 * The hero's escrow receipt — one example escrow, mid-flight. Every figure
 * is the shared example's (content/escrow-example.ts), which the phone's
 * escrow screen in §00 draws too; the receipt only adds its eyebrow and the
 * assurance the phone screen has no room for.
 */
export const ESCROW_PANEL = {
  eyebrow: 'Escrow',
  ...EXAMPLE_ESCROW,
  custody: `${EXAMPLE_ESCROW.custody}. Neither party can move it.`,
} as const

/**
 * The one cell HeroStatRow swaps for the live platform fee, matched by label.
 * Declared above the array so the two cannot disagree about the spelling.
 */
const FEE_STAT_LABEL = 'Flat fee'

/**
 * Only the FEE cell is genuinely async — it waits on /v1/platform/config, so
 * it carries a static value for the loading and error paths. Every other cell
 * is either a constant or already known at build time, so they are final here
 * rather than "fallbacks" the row re-derives.
 */
export const HERO_STATS_FALLBACK: readonly HeroStat[] = [
  { value: '< 2s',  label: 'Escrow lock' },
  { value: `${FEE_PCT}%`, label: FEE_STAT_LABEL },
  { value: '100%',  label: 'On-chain' },
  { value: String(TRADE_MARKET_COUNT), label: 'Fiat markets' },
] as const

/**
 * Which cell HeroStatRow replaces with the live platform fee. Derived here,
 * beside the array, so reordering the stats cannot leave the row overwriting
 * the wrong cell — an index written out in the consumer would.
 *
 * A miss yields -1, which no index equals, so the row would quietly keep
 * showing the default fee forever with nothing thrown. That silent mode is
 * what the accompanying test exists to catch.
 */
export const FEE_STAT_INDEX = HERO_STATS_FALLBACK.findIndex(
  (stat) => stat.label === FEE_STAT_LABEL,
)
