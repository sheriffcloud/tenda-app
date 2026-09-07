/**
 * §01 Hero copy. The headline is a brand fixture — do not reword casually.
 * Stat row pulls live values from /v1/platform/config when available;
 * `HERO_STATS_FALLBACK` only renders if the API call fails or is in flight.
 */

import { APP_INFO } from '@/content'

export interface HeroStat {
  value: string
  label: string
}

export const HERO_CONTENT = {
  stamps: {
    versionLabel: `${APP_INFO.version.split('-')[0]} · ${APP_INFO.chains.stage}`,
    liveLabel: `Live on ${APP_INFO.chains.networksLine}`,
  },
  h1: {
    line1: 'The escrow',
    line2: 'does the',
    line3: 'trusting.',
  },
  ribbon: [
    'The money locks in an on-chain escrow the moment a gig posts or an offer goes live — USDC, SOL or ETH. Nobody holds your funds — not us, not the counterparty, not an exchange.',
    'Proof releases. The contract settles.',
  ] as const,
  cta: {
    primary: 'Download for Android',
  },
  /** Caption under the swipe deck. */
  deckCaption: 'Example gigs · escrow releases on proof',
} as const

export const HERO_STATS_FALLBACK: readonly HeroStat[] = [
  { value: '< 2s',  label: 'Escrow lock' },
  { value: '2.5%',  label: 'Flat fee' },
  { value: '100%',  label: 'On-chain' },
  { value: '8',     label: 'Fiat markets' },
] as const
