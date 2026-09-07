/**
 * Per-FAMILY display facts: the marketing-cased name, the one-character glyph
 * and the chain's brand colour. Display data, keyed by manifest `family` the
 * way ASSET_META is keyed by asset id — the one place a per-chain hex is
 * allowed to exist.
 *
 * Moved here from apps/tendahq/src/content/chains.ts (#60 port prerequisite):
 * the web app draws the same chain badge on every card, row and detail, and a
 * second copy of four hex values is exactly how the two clients would drift.
 * tendahq keeps only what is marketing's — the pitch and the strength phrase.
 *
 * A family absent here is NOT an error: adding a chain is a manifest entry
 * plus secrets, and the display row may follow. Callers get `null` and draw
 * the neutral fallback (see `chainDisplay`).
 */

export interface ChainFamilyDisplay {
  /** Marketing-cased name (manifest displayName is UPPER for some chains). */
  name: string
  /** Single-character mark used in badges and panels. */
  glyph: string
  /** Chain brand colour as a hex string. */
  color: string
}

const CHAIN_FAMILY_DISPLAY: Readonly<Record<string, ChainFamilyDisplay>> = {
  // 0G's violet accent, read from 0g.ai's own palette (2026-08-27).
  '0g': { name: '0G', glyph: '◈', color: '#C681FF' },
  solana: { name: 'Solana', glyph: '◎', color: '#9945FF' },
  base: { name: 'Base', glyph: '●', color: '#0052FF' },
  celo: { name: 'Celo', glyph: '◍', color: '#FCFF52' },
}

/** The glyph drawn for a family with no display row. */
export const CHAIN_FALLBACK_GLYPH = '●'

/**
 * The two inks a glyph can be drawn in on its brand disc. Fixed values on
 * purpose — the disc is the brand colour in BOTH themes, so its ink cannot
 * follow a theme token. `chainGlyphInk` picks between them per colour.
 */
export const CHAIN_GLYPH_INK = { dark: '#0D1018', light: '#FFFFFF' } as const
export type ChainGlyphInk = keyof typeof CHAIN_GLYPH_INK

/**
 * OWN properties only: a plain object literal inherits Object.prototype, so
 * `CHAIN_FAMILY_DISPLAY['constructor']` would otherwise be a function.
 */
export function chainFamilyDisplay(family: string): ChainFamilyDisplay | null {
  return Object.hasOwn(CHAIN_FAMILY_DISPLAY, family) ? CHAIN_FAMILY_DISPLAY[family] : null
}

/** WCAG relative luminance of a `#rrggbb` colour; null when it is not one. */
function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (match === null) return null
  const channel = (at: number) => {
    const c = parseInt(match[1].slice(at, at + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Which ink reads better on a brand disc: the one with the HIGHER contrast
 * ratio against the colour. Not a 50% luminance cut — that would put white on
 * 0G's violet at 2.6:1 where the dark ink reaches 7.2:1. A colour that is not
 * a six-digit hex (a CSS variable, a fallback) gets the light ink, since every
 * fallback surface is the brand blue.
 */
export function chainGlyphInk(color: string): ChainGlyphInk {
  const surface = relativeLuminance(color)
  if (surface === null) return 'light'
  // The two inks' luminances are constants of the palette above; computed
  // here rather than written down so a changed ink cannot leave a stale number.
  const dark = relativeLuminance(CHAIN_GLYPH_INK.dark) ?? 0
  const light = relativeLuminance(CHAIN_GLYPH_INK.light) ?? 1
  return contrast(surface, dark) >= contrast(surface, light) ? 'dark' : 'light'
}
