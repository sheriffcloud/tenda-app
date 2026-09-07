/**
 * Onboarding-rail feature cards — the "you don't need gas money to start"
 * story. Status is honest: `live` ships today, `in-progress` is being built.
 * Chain names/glyphs derive from content/chains.ts (manifest-backed).
 */

export type FeatureStatus = 'live' | 'in-progress'

export interface OnboardingFeature {
  id: string
  /** Lucide icon name, resolved by the section renderer. */
  icon: 'Fuel' | 'Sparkles' | 'Wallet' | 'Zap'
  /** Manifest family this feature belongs to, or null for cross-chain. */
  chainFamily: 'solana' | 'base' | 'celo' | null
  status: FeatureStatus
  title: string
  body: string
  /** Mono fact line under the body — a concrete, verifiable detail. */
  fact: string
}

export const ONBOARDING_FEATURES: readonly OnboardingFeature[] = [
  {
    id: 'celo-usdc-gas',
    icon: 'Fuel',
    chainFamily: 'celo',
    status: 'live',
    title: 'Your USDC pays its own gas',
    body: 'On Celo, network fees come out of the same USDC you trade with. No hunting for a separate gas token before your first move.',
    fact: 'feeCurrency: USDC — no CELO required',
  },
  {
    id: 'solana-gas-grant',
    icon: 'Sparkles',
    chainFamily: 'solana',
    status: 'live',
    title: 'Start with zero SOL',
    body: 'Link your first Solana wallet and Tenda seeds it with enough SOL for a full escrow lifecycle — post, lock, settle. One grant per user, on us.',
    fact: 'one-time gas grant · covers your first escrow',
  },
  {
    id: 'any-wallet',
    icon: 'Wallet',
    chainFamily: null,
    status: 'live',
    title: 'Bring the wallet you already have',
    body: 'Phantom, Solflare and other Solana wallets connect natively. On EVM chains, every wallet in the Reown AppKit roster just works.',
    fact: 'Phantom · Solflare · 400+ wallets via Reown AppKit',
  },
  {
    id: 'base-gasless',
    icon: 'Zap',
    chainFamily: 'base',
    status: 'in-progress',
    title: 'Gasless on Base',
    body: 'Sponsored transactions through Base Paymaster are in the works — your first escrows on Base without holding ETH at all.',
    fact: 'Base Paymaster · sponsored first transactions',
  },
] as const

export const ONBOARDING_HEADER = {
  eyebrow: 'Onboarding · no gas, no friction',
  h2: { lead: 'The hardest part of crypto,', emphasis: 'removed.' },
  sub: 'Most people quit at "first, buy a gas token." Tenda deletes that step on every chain it supports — each one a different rail, all of them invisible to you.',
} as const
