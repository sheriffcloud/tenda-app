/**
 * The one hand-kept boundary in the type pipeline: which next/font/google
 * export loads each of mobile's three face families.
 *
 * Mobile names faces per weight ('SpaceGrotesk_700Bold') because that is what
 * expo-font registers; the web family name cannot be derived from that key
 * safely ('JetBrainsMono' is not 'Jet Brains Mono'), so the table below names
 * the export for each face PREFIX. `nextFontFor(role)` reads the prefix off
 * the role's first face, and `scripts/__tests__/faces.test.ts` asserts that
 * app/layout.tsx imports exactly these exports and globals.css binds each
 * role to the variable — the drift guard for the day mobile changes a face.
 */
import { typography } from '../../../mobile/theme/tokens'
import type { FontRole } from './typography'

export interface NextFont {
  /** The named export of next/font/google. */
  exportName: string
  /** The CSS variable next/font publishes, and globals.css reads. */
  variable: string
}

const NEXT_FONT_BY_PREFIX: Readonly<Record<string, NextFont>> = {
  SpaceGrotesk: { exportName: 'Space_Grotesk', variable: '--font-space-grotesk' },
  Manrope: { exportName: 'Manrope', variable: '--font-manrope' },
  JetBrainsMono: { exportName: 'JetBrains_Mono', variable: '--font-jetbrains-mono' },
}

/** 'SpaceGrotesk_700Bold' → 'SpaceGrotesk'. */
export function facePrefix(face: string): string {
  return face.split('_')[0]
}

/** Role → per-weight faces, the shape of `typography.fonts` without its literal types. */
type FontsTable = Readonly<Record<FontRole, Readonly<Record<string, string>>>>

/** The fonts table is a parameter (defaulting to mobile's) so the refusals can be tested. */
export function nextFontFor(role: FontRole, fonts: FontsTable = typography.fonts): NextFont {
  const faces = Object.values<string>(fonts[role])
  const prefixes = new Set(faces.map(facePrefix))
  if (prefixes.size !== 1) {
    throw new Error(`faces: role "${role}" mixes families (${[...prefixes].join(', ')})`)
  }
  const [prefix] = prefixes
  if (!Object.hasOwn(NEXT_FONT_BY_PREFIX, prefix)) {
    throw new Error(`faces: no next/font export is mapped for "${prefix}" — add it to NEXT_FONT_BY_PREFIX`)
  }
  return NEXT_FONT_BY_PREFIX[prefix]
}
