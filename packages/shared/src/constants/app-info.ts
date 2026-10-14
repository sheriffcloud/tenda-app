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
 * A FUNCTION because the window is a CONTRACT value that differs per chain
 * (Celo mainnet 24h, the testnets 48h) and is served live as
 * `approval_window_seconds` on each `ChainRegistryEntry` (#148). A surface
 * holding the registry passes the real numbers through `guaranteeForWindows`;
 * `APP_INFO.guarantee` is the static fallback for surfaces with no registry
 * to hand, and it names NO number — a static count was how the feed hero
 * promised 48 hours on a deployment whose contract enforces 24.
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

/** The same right with no count: for surfaces that hold no window, or hold several. */
export const GUARANTEE_WITHOUT_HOURS =
  'Locked before you start. If they go quiet, claim it yourself once the review window closes.'

/**
 * The promise for a DEPLOYMENT: the served chains' windows, in seconds. Names
 * the hours only when every chain agrees — a deployment serving a 24h and a
 * 48h chain has no one number to promise, and picking either would be wrong
 * for half its gigs. Empty (registry not loaded) falls back the same way.
 */
export function guaranteeForWindows(windowsSeconds: readonly number[]): string {
  const [first, ...rest] = windowsSeconds
  if (first === undefined || rest.some((w) => w !== first)) return GUARANTEE_WITHOUT_HOURS
  return guaranteeAfter(Math.round(first / 3600))
}

export const APP_INFO = {
  name: 'Tenda',

  /** BRAND LINE — footers, splash, the landing hero. Not a product summary. */
  tagline: 'The human layer for autonomous Agents.',

  /**
   * PRODUCT LINE — metadata, OG cards, store listings, the WalletConnect
   * modal. The most syndicated string here, and the one that used to say
   * "Post or accept gigs", describing half the product to every one of them.
   */
  description:
    'On-chain gigs and P2P cash trades for people and AI agents. Funds are committed before work starts and released when the required proof is accepted.',

  /** CALL TO ACTION — buttons, sticky bars, the one-line sell. */
  shortPitch: 'Get paid, or claim it yourself.',

  /** Static form of the right, for surfaces with no registry: no hours named. */
  guarantee: GUARANTEE_WITHOUT_HOURS,

  fees: {
    /**
     * STATIC COPY ONLY (support/marketing screens). Live surfaces must read
     * GET /v1/platform/config — the platform_config table is the runtime
     * truth and this number can lag it.
     */
    platformFeePct: 2.5,
  },

  support: {
    whatsapp: 'https://chat.whatsapp.com/FP3Tv8157jZJmxq48jurnS',
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
    /**
     * The Agent API reference (`apps/docs`), on its own subdomain because it
     * is its own deployment.
     *
     * A CONSTANT, not per-app env, and the distinction is the one this file's
     * siblings already draw: `legal.terms` and `tendaPlayStore` are constants
     * because they are the same URL everywhere, while tendahq's
     * `ENV.webAppUrl` is env-driven "because it differs per deployment —
     * production points at the production app, Vercel previews at the dev
     * app". The docs site has no such variance: it renders one document, and
     * its only per-deployment value (`VITE_API_BASE_URL`) is resolved INSIDE
     * it. Env would also mean four prefixed spellings of one fact —
     * VITE_/NEXT_PUBLIC_/EXPO_PUBLIC_ plus a server var — three of which can
     * silently go unset and render a dead link on a public page. The SERVER is
     * the case that settles it: `agent-card/card.ts` already builds ERC-8004
     * registration entries from `external.website` and `support.email`, and it
     * can read neither a Vite nor a Next env.
     */
    docs: 'https://docs.tendahq.com',
    /**
     * The brand mark, as an absolute URL.
     *
     * ABSOLUTE ON PURPOSE: the agent card (#105) is an ERC-8004 registration
     * file read by registries and wallets that have no page context to resolve
     * a relative path against. It is the app icon rather than a purpose-made
     * OG image because that is the only image we actually serve today; a
     * per-agent avatar overrides it whenever the agent has uploaded one.
     */
    logo: 'https://tendahq.com/favicon.png',
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
