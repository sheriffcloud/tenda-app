/**
 * Cross-section facts only — name, taglines, distribution URLs, social links,
 * version, chain identity. Per-section copy lives in the other files in
 * src/content/. Example gigs live in tasks.ts, trade corridors in trades.ts.
 */

import { CHAIN_NAMES_LINE } from './chains'

export const APP_INFO = {
  name: 'Tenda',
  tagline: 'Get paid. No middlemen.',
  description:
    'Post or accept gigs with instant on-chain escrow. Proof required. Payment guaranteed.',

  /**
   * Long-form "about" paragraph used in the footer wordmark column. Reads as
   * the brand's elevator pitch — written for a reader who arrives at the
   * footer without context.
   */
  about:
    `Tenda is the escrow-secured marketplace for gig work and P2P cash trades. The escrow contracts run on ${CHAIN_NAMES_LINE} — funds lock when work is posted and release the moment proof clears. Built for emerging markets first.`,

  /** Distribution. */
  apkUrl: 'https://github.com/wisdomabioye/tenda-app/releases/download/v0.4.3-testnet/0.4.3-testnet.apk',
  appStoreUrl: '#',
  playStoreUrl: '#',
  qrTarget: 'tenda.so/get',

  /** Build / release. */
  version: 'v0.4.3-testnet',
  buildLocation: 'Lagos',

  /** Chain identity surfaced in section metas + footer status. */
  chains: {
    /** "Solana · Base · Celo" — derived from the shared CHAIN_MANIFEST. */
    networksLine: CHAIN_NAMES_LINE,
    /** Release stage qualifier shown next to the network line. */
    stage: 'testnet release',
    /** Where to read the contracts. */
    contractsUrl: 'https://github.com/wisdomabioye/tenda-app',
  },

  /** Social. */
  twitterUrl: 'https://x.com/tendahq',
  whatsappUrl: 'https://chat.whatsapp.com/EeB5OMalNy0EbMlU4QPZMr?mode=hq2tcli',
  discordUrl: '#',
  githubUrl: '#',
  telegramUrl: 'https://t.me/tendahq',
} as const

export type AppInfo = typeof APP_INFO
