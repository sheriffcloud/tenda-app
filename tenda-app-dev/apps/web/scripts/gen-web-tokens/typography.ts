/**
 * Mobile's `typography.styles` as Tailwind v4 utilities: one `type-<atom>`
 * class per style, named after it (`bodySmall` → `type-body-small`), carrying
 * the face ROLE, size, line-height, weight and tracking exactly as tokens.ts
 * states them. The set is never listed here — a list in prose is what drifts
 * the day a style joins — `typeAtoms()` is the list. Both targets emit this
 * block; web components and tendahq's type sheet consume it, so a size
 * changed on the phone reaches both in one regenerate.
 *
 * The face itself is not generated. Mobile names native faces per weight
 * ('SpaceGrotesk_700Bold'); each atom resolves to the ROLE that face belongs
 * to and writes `var(--font-<role>)`, and the three roles are bound to real
 * web fonts by hand — next/font in web's app/layout.tsx, @fontsource in
 * tendahq's styles/base.css. `faces.ts` holds the face → next/font table and
 * its test keeps layout.tsx honest.
 *
 * `@utility` rules are only compiled when scanned content uses the class,
 * which a design-system sheet cannot rely on (the foundations page builds
 * the names from `typeAtoms()` at runtime), so the block opens with an
 * `@source inline()` safelist naming every atom.
 */
import { typography, type TextStyleToken } from '../../../mobile/theme/tokens'
import { kebab } from './core'

export type FontRole = keyof typeof typography.fonts

const ROLES = Object.keys(typography.fonts) as FontRole[]

/** The role a native face belongs to: 'SpaceGrotesk_700Bold' → 'display'. */
export function fontRoleOf(face: string): FontRole {
  const role = ROLES.find((candidate) =>
    Object.values<string>(typography.fonts[candidate]).includes(face),
  )
  if (role === undefined) {
    throw new Error(`type atoms: "${face}" is not a face typography.fonts names`)
  }
  return role
}

export interface TypeAtom {
  /** The class suffix: `type-<name>`. */
  name: string
  role: FontRole
  fontSize: number
  lineHeight: number
  fontWeight: string
  letterSpacing: number | null
}

export const TYPE_CLASS_PREFIX = 'type-'

export function typeAtoms(): TypeAtom[] {
  return Object.entries(typography.styles).map(([key, style]) => {
    // Widened on purpose: the styles are `as const` literals, and only some
    // carry letterSpacing, so the union has no common property to read.
    const token: TextStyleToken = style
    return {
      name: kebab(key),
      role: fontRoleOf(token.fontFamily),
      fontSize: token.fontSize,
      lineHeight: token.lineHeight,
      fontWeight: token.fontWeight,
      letterSpacing: token.letterSpacing ?? null,
    }
  })
}

/** One `@utility` per atom. Mono atoms take tabular figures — the brief's one rule. */
export function typeUtilities(): string {
  return typeAtoms()
    .map((atom) => {
      const lines = [
        `  font-family: var(--font-${atom.role});`,
        `  font-size: ${atom.fontSize}px;`,
        `  line-height: ${atom.lineHeight}px;`,
        `  font-weight: ${atom.fontWeight};`,
      ]
      if (atom.letterSpacing !== null) lines.push(`  letter-spacing: ${atom.letterSpacing}px;`)
      if (atom.role === 'mono') lines.push('  font-variant-numeric: tabular-nums;')
      return `@utility ${TYPE_CLASS_PREFIX}${atom.name} {\n${lines.join('\n')}\n}`
    })
    .join('\n')
}

/**
 * The safelist that makes every atom exist whether or not a scan finds it.
 *
 * One line per atom, no brace list. `@source inline("type-{hero,h1,…}")` was
 * measured against the real build: the twelve digit-free names compiled and
 * `type-h1`, `type-h2`, `type-h3` did not — Tailwind's brace expansion drops
 * the alternatives with a digit — so the foundations page drew those three
 * rows unstyled. A plain literal per atom has no expansion to get wrong.
 */
export function typeSourceInline(): string {
  return typeAtoms()
    .map((atom) => `@source inline("${TYPE_CLASS_PREFIX}${atom.name}");`)
    .join('\n')
}

export function typeBlock(): string {
  return `/* ── Type atoms: mobile typography.styles ──────────────────── */
${typeSourceInline()}
${typeUtilities()}
`
}
