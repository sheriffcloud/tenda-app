/**
 * Chain registry for the landing — DERIVED from @tenda/shared CHAIN_MANIFEST
 * (the monorepo's single source of chain truth), so a chain added there shows
 * up across the landing with zero code changes here. Only marketing display
 * extras (brand colour, glyph, one-line pitch) live in this file, keyed by
 * manifest `family`.
 */

import { CHAIN_MANIFEST, type GasPolicy } from '@tenda/shared/chains'

interface ChainDisplay {
  /** Marketing-cased name (manifest displayName is UPPER for some chains). */
  name: string
  /** Single-character mark used in badges and panels. */
  glyph: string
  /** Chain brand colour — the one place a per-chain hex is allowed. */
  color: string
  /** One-line positioning used on chain badges / ecosystem panels. */
  pitch: string
}

/** Display extras per manifest family. Add a row when a new family ships. */
const FAMILY_DISPLAY: Record<string, ChainDisplay> = {
  solana: {
    name: 'Solana',
    glyph: '◎',
    color: '#9945FF',
    pitch: 'Sub-second settlement, fees too small to notice.',
  },
  base: {
    name: 'Base',
    glyph: '●',
    color: '#0052FF',
    pitch: 'Coinbase’s L2 — USDC-native, built to onboard everyone.',
  },
  celo: {
    name: 'Celo',
    glyph: '◍',
    color: '#FCFF52',
    pitch: 'Mobile-first L2 where stablecoins pay their own gas.',
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
  gasPolicy: GasPolicy
  explorerUrl?: string
}

/**
 * The chains the landing talks about: every MAINNET manifest entry, in
 * manifest order (Solana first). Testnet entries never surface in marketing.
 */
export const LANDING_CHAINS: readonly LandingChain[] = CHAIN_MANIFEST.filter(
  (entry) => entry.kind === 'mainnet',
).map((entry) => {
  const display = FAMILY_DISPLAY[entry.family]
  return {
    id: entry.id,
    family: entry.family,
    name: display?.name ?? entry.displayName,
    glyph: display?.glyph ?? '●',
    color: display?.color ?? 'var(--brand)',
    pitch: display?.pitch ?? '',
    gasPolicy: entry.gasPolicy,
    explorerUrl: entry.explorerUrl,
  }
})

/** "Solana · Base · Celo" — the recurring network line. */
export const CHAIN_NAMES_LINE = LANDING_CHAINS.map((c) => c.name).join(' · ')

/** Trailing badge after the chain list. */
export const MORE_CHAINS_LABEL = 'More coming'

export function chainByFamily(family: string): LandingChain | undefined {
  return LANDING_CHAINS.find((c) => c.family === family)
}
