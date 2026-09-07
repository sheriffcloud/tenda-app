import { PLATFORM_CONFIG_DEFAULTS } from './platform'

/**
 * Brand facts — the ONLY source of product identity strings and outbound
 * links, shared by mobile, web and the landing page (which composes these
 * with its release-specific facts: version, APK url, about copy).
 *
 * Consolidated 2026-08-15 from apps/mobile/lib/app-info.ts and
 * apps/tendahq/src/content/app-info.ts, which had already drifted apart.
 * Release/distribution facts (version, apkUrl) deliberately stay in the
 * landing page's own file — scripts/check-app-version.mjs gates them there
 * against app.json.
 *
 * THREE PITCH STRINGS WITH THREE JOBS, because one string doing two jobs is
 * how they drifted the second time. By 2026-08-31 the product had NINE
 * competing pitches: a benefit tagline here, a mechanism headline on the
 * landing, and seven restatements in between. Each of the three below names
 * where it goes; none may be reused somewhere another one belongs, and no app
 * may hardcode a rival — `test/constants/pitch-strings.test.ts` enforces that.
 *
 * All three cover BOTH products (gig work and P2P cash trades) and BOTH kinds
 * of poster (people and AI agents). A pitch that names only gigs describes
 * half the product; one that names only people is now describing it wrong.
 */
/**
 * The stalled-payment promise, in words, for a given approval window.
 *
 * A FUNCTION because the window is `platform_config.approval_window_seconds`,
 * not a constant: any surface holding the live config should pass the real
 * number rather than repeat a literal that can silently fall out of date.
 * `APP_INFO.guarantee` is the static fallback for surfaces that have no config
 * to hand, on the same terms as `fees.platformFeePct` below.
 *
 * The claim is exact. `TendaEscrow.claimStalledPayment` lets the COUNTERPARTY
 * settle once `block.timestamp >= approvalDeadline`, with no poster, admin or
 * dispute involved (`POST /v1/escrows/:id/claim`). So this is not "payment
 * guaranteed" hand-waving — it is a specific right, and it was missing from
 * every brand string the product had.
 */
export function guaranteeAfter(hours: number): string {
  return `Locked before you start. If they go quiet, claim it yourself after ${hours} hours.`
}

const APPROVAL_WINDOW_HOURS = Math.round(PLATFORM_CONFIG_DEFAULTS.approval_window_seconds / 3600)

export const APP_INFO = {
  name: 'Tenda',

  /** BRAND LINE — footers, splash, the landing hero. Not a product summary. */
  tagline: 'The escrow does the trusting.',

  /**
   * PRODUCT LINE — metadata, OG cards, store listings, the WalletConnect
   * modal. The most syndicated string here, and the one that used to say
   * "Post or accept gigs", describing half the product to every one of them.
   */
  description:
    'Escrow-secured gigs and P2P cash trades, hired by people and AI agents. Money locks on-chain before work starts; proof releases it.',

  /** CALL TO ACTION — buttons, sticky bars, the one-line sell. */
  shortPitch: 'Get paid, or claim it yourself.',

  /** Static form of guaranteeAfter(), for surfaces with no live config. */
  guarantee: guaranteeAfter(APPROVAL_WINDOW_HOURS),

  fees: {
    /**
     * STATIC COPY ONLY (support/marketing screens). Live surfaces must read
     * GET /v1/platform/config — the platform_config table is the runtime
     * truth and this number can lag it.
     */
    platformFeePct: 2.5,
  },

  support: {
    whatsapp: 'https://chat.whatsapp.com/EeB5OMalNy0EbMlU4QPZMr?mode=hq2tcli',
    email: 'hello@tendahq.com',
  },

  legal: {
    terms: 'https://tendahq.com/terms',
    privacy: 'https://tendahq.com/privacy',
  },

  social: {
    twitter: 'https://x.com/tendahq',
    instagram: 'https://instagram.com/tendahq',
    telegram: 'https://t.me/tendahq',
  },

  external: {
    website: 'https://tendahq.com',
    tendaPlayStore: 'https://play.google.com/store/apps/details?id=com.tendahq.mobile',
  },

  wallets: {
    phantom: {
      name: 'Phantom',
      playStore: 'https://play.google.com/store/apps/details?id=app.phantom',
    },
    solflare: {
      name: 'Solflare',
      playStore: 'https://play.google.com/store/apps/details?id=com.solflare.mobile',
    },
  },
} as const

export type AppInfo = typeof APP_INFO
