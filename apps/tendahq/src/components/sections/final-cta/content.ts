/**
 * §08 The closer — the last statement, ruled.
 *
 *   1. Google Play renders as a disabled "· soon" control — the listing does
 *      not exist yet. Only the APK link and the web app are live.
 *   2. The receipts strip carries three pre-launch facts only — no fictional
 *      `1.7s · 1.5% · 0.4%` triple; each is pinned to its source by test.
 *   3. The QR block stays out until `tendahq.com/get` exists (QR_FALLBACK is
 *      kept below for that day).
 */

import { APP_INFO } from '@/content'
import { LIVE_CHAINS, MAINNET_STATUS_CLAUSE } from '@/content/chain-status'
import { FEE_PCT, SEEKER_FEE_PCT } from '@/content/fees'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared/constants/platform'

export const FINAL_CTA_HEADER = {
  eyebrow: 'Ship it',
  h2: ['Stop waiting', 'Start earning'],
  // Qualified by the release stage rather than left bare: the stage is
  // derived from the version suffix, so it says "testnet release" today and
  // "mainnet" the day that ships.
  say: `Or hiring. Or trading. The contract is live (${APP_INFO.chains.stage}), the wallet is in your pocket, and the next gig is one tap away.`,
  /** The mono line under the controls. */
  sub: `Android · ${APP_INFO.version}`,
} as const

export const DOWNLOAD_BUTTONS = {
  apk: { label: 'Download APK', href: APP_INFO.apkUrl },
  /** Store listings that do not exist yet, rendered disabled. */
  comingSoon: ['Google Play'],
  soonSuffix: '· soon',
  /** The disabled control's tooltip. */
  soonTitle: (store: string): string => `${store} — coming soon`,
} as const

export const QR_FALLBACK = {
  title: 'Or scan with your phone',
  body: 'Routes to your device store ·',
  /**
   * Final destination once `tendahq.com/get` is implemented. **Not live yet.**
   * The QR pattern below is decorative — pointing it at this URL today would
   * resolve to nothing.
   */
  destination: 'tendahq.com/get',
  pendingLabel: 'preview · launching soon',
} as const

export interface Receipt {
  k: string
  /** Main display value (mono). */
  v: string
  /** Optional unit suffix in muted tone. */
  unit?: string
  /** End the value on the brand-blue period — for the one that is a word. */
  period?: true
  /** Subline caption. */
  b: string
}

export const RECEIPTS: readonly Receipt[] = [
  {
    k: 'Chains',
    // Counts LIVE chains, not listed ones. It read "4 live" while every one
    // of those four mainnets was undeployed — the receipt asserting hardest
    // was the one with no evidence behind it. The subline is the manifest's
    // own status clause, so a deploy updates the count and the words together.
    v: String(LIVE_CHAINS.length),
    unit: 'live',
    b: MAINNET_STATUS_CLAUSE,
  },
  {
    k: 'Worker keeps',
    // 100 − fee, in exact bps math off the same platform-config default
    // FEE_PCT displays. 'No platform cut on payouts' was simply false — the
    // fee is real, on-chain, and proudly flat; understating it is the one
    // thing a receipts strip must never do.
    v: String((10_000 - PLATFORM_CONFIG_DEFAULTS.fee_bps) / 100),
    unit: '%',
    b: `One flat ${FEE_PCT}% fee · ${SEEKER_FEE_PCT}% for Seeker owners`,
  },
  {
    k: 'Custody',
    v: 'Yours',
    period: true,
    b: 'Contract-only escrow · no admin override',
  },
]
