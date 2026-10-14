import { findChain } from '../chains/manifest-queries'
import {
  CHAIN_FALLBACK_GLYPH,
  CHAIN_GLYPH_INK,
  chainFamilyDisplay,
  chainGlyphInk,
  type ChainGlyphInk,
} from '../chains/display'
import { chainLabel } from './chain-label'

/**
 * Everything a chain BADGE needs, from one CAIP-2 id: the manifest's own
 * display name (the label every surface already prints through `chainLabel`),
 * plus the family's glyph and brand colour when a display row exists.
 *
 * `color` is `null` for an id with no family display row AND for an id the
 * manifest does not know — the badge then draws its neutral fallback rather
 * than a colour this module invented. The label falls back through
 * `chainLabel` ('Unknown') for the same reason.
 */
export interface ChainDisplay {
  /** The manifest displayName — "Solana Devnet", "Base Sepolia". */
  label: string
  glyph: string
  /** Brand hex, or null when no family row exists. */
  color: string | null
  /** Which of the two fixed inks reads on `color` (light on the fallback). */
  ink: ChainGlyphInk
  /** The ink as a colour value, for a style attribute. */
  inkColor: string
}

export function chainDisplay(chainId: string): ChainDisplay {
  const entry = findChain(chainId)
  const family = entry === undefined ? null : chainFamilyDisplay(entry.family)
  const color = family?.color ?? null
  const ink = color === null ? 'light' : chainGlyphInk(color)
  return {
    label: chainLabel(chainId),
    glyph: family?.glyph ?? CHAIN_FALLBACK_GLYPH,
    color,
    ink,
    inkColor: CHAIN_GLYPH_INK[ink],
  }
}
