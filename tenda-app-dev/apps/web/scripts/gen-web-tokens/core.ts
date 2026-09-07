/**
 * Pure rendering core for the design-token generator. No filesystem, no
 * process — main.ts owns the CLI. Kept separate so the transforms are unit-
 * testable (scripts/__tests__/gen-web-tokens.test.ts) while the CI drift gates
 * (`gen:tokens:check`, in web and in tendahq) exercise the full pipeline.
 *
 * Two targets share this file: web (three theme blocks plus a Tailwind map,
 * `render` below) and tendahq (one light-dark() block, tendahq.ts). Every
 * transform, the whole geometry set, the omitted colour groups (naming.ts)
 * and the type atoms (typography.ts) are shared; only the colour block's
 * shape differs, so a token added to mobile reaches both apps in one
 * regenerate.
 */
import { colors, motion, radius, shadows, spacing, type ColorScheme } from '../../../mobile/theme/tokens'
import { kebab, omitted } from './naming'
import { typeBlock } from './typography'

export { kebab, OMITTED_GROUPS } from './naming'

/**
 * Flattens the nested ColorScheme into ordered [--custom-property, value] pairs.
 *
 * The walk is typed over `unknown` on purpose: ColorScheme is an INTERFACE,
 * and an interface has no implicit index signature, so it cannot be handed to
 * a recursive `{ [key]: string | Tree }` walker without a cast either way.
 * Casting once at this boundary and narrowing each leaf with `typeof value
 * === 'string'` keeps the walker generic over every group mobile adds, while
 * `any` would have let a non-string leaf through as a token value.
 */
export function flattenScheme(scheme: ColorScheme): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  const walk = (node: Record<string, unknown>, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        pairs.push([`--${path.concat(key).map(kebab).join('-')}`, value])
      } else {
        walk(value as Record<string, unknown>, path.concat(key))
      }
    }
  }
  walk(scheme as unknown as Record<string, unknown>, [])
  return pairs
}

/** The colour tokens a target actually receives: the flattened scheme minus the omitted groups. */
export function schemePairs(scheme: ColorScheme): Array<[string, string]> {
  return flattenScheme(scheme).filter(([property]) => !omitted(property))
}

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '')
  // '#abc' is shorthand for '#aabbcc' — expanding first keeps the math right
  // for any future mobile token, not just the all-zero '#000'.
  const value = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  if (value.length !== 6 || /[^0-9a-fA-F]/.test(value)) {
    throw new Error(`hexToRgb: unsupported hex colour "${hex}"`)
  }
  const int = parseInt(value, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/** The fields a CSS box-shadow needs — RN's `elevation` is Android-only noise here. */
export interface ShadowToken {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
}

/** Collapses an RN shadow token into a CSS box-shadow value. */
export function shadowToCss(shadow: ShadowToken): string {
  const [r, g, b] = hexToRgb(shadow.shadowColor)
  return `${shadow.shadowOffset.width}px ${shadow.shadowOffset.height}px ${shadow.shadowRadius}px rgba(${r},${g},${b},${shadow.shadowOpacity})`
}

/** A CSS cubic-bezier from mobile's four-number easing tuple. */
export function easingToCss(curve: readonly number[]): string {
  if (curve.length !== 4) {
    throw new Error(`easingToCss: expected 4 control points, got ${curve.length}`)
  }
  return `cubic-bezier(${curve.join(', ')})`
}

/**
 * Every theme-independent token as ordered [--custom-property, value] pairs:
 * radius, spacing, shadows, then motion — durations in ms, easings as
 * cubic-bezier (the spring has no CSS form and stays mobile's). Both targets
 * emit exactly this list.
 */
export function geometryPairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const [key, value] of Object.entries(radius)) {
    pairs.push([`--radius-${kebab(key)}`, `${value}px`])
  }
  for (const [key, value] of Object.entries(spacing)) {
    pairs.push([`--space-${kebab(key)}`, `${value}px`])
  }
  for (const [key, value] of Object.entries(shadows)) {
    pairs.push([`--shadow-${kebab(key)}`, shadowToCss(value)])
  }
  for (const [key, value] of Object.entries(motion.duration)) {
    pairs.push([`--duration-${kebab(key)}`, `${value}ms`])
  }
  for (const [key, value] of Object.entries(motion.easing)) {
    pairs.push([`--easing-${kebab(key)}`, easingToCss(value)])
  }
  return pairs
}

function geometryBlock(): string {
  return geometryPairs()
    .map(([property, value]) => `  ${property}:${value};`)
    .join('\n')
}

function colourLines(scheme: ColorScheme): string {
  return schemePairs(scheme)
    .map(([property, value]) => `  ${property}:${value};`)
    .join('\n')
}

/**
 * Maps every token into Tailwind v4 theme namespaces so utilities exist for
 * all of them (bg-surface-card, text-content-primary, rounded-card, p-md,
 * shadow-elevated) while the values keep flowing through the :root custom
 * properties — theme switching stays pure CSS.
 */
function themeMapBlock(): string {
  const lines: string[] = []
  for (const [property] of schemePairs(colors.light)) {
    lines.push(`  --color-${property.slice(2)}:var(${property});`)
  }
  for (const key of Object.keys(radius)) {
    lines.push(`  --radius-${kebab(key)}:var(--radius-${kebab(key)});`)
  }
  // Spacing is deliberately NOT mapped into Tailwind's --spacing-* namespace:
  // sizing utilities (max-w-*, w-*, size-*) resolve named keys through the
  // spacing scale first, so `--spacing-5xl:64px` silently turns `max-w-5xl`
  // into 64 PIXELS. Mobile's spacing is Tailwind's default 4px rhythm, so
  // components use numeric utilities (p-4 = --space-md = 16px); the raw
  // --space-* custom properties above stay available for plain CSS. Motion
  // is not mapped either: Tailwind's own --ease-* / --animate-* namespaces
  // carry defaults, and nothing in web reads the mobile curves yet.
  for (const key of Object.keys(shadows)) {
    lines.push(`  --shadow-${kebab(key)}:var(--shadow-${kebab(key)});`)
  }
  return `/* ── Tailwind utility mapping ──────────────────────────────── */
@theme inline{
${lines.join('\n')}
}
`
}

export function render(): string {
  const light = colourLines(colors.light)
  const dark = colourLines(colors.dark)
  return `/* GENERATED from apps/mobile/theme/tokens.ts — do not edit.
 * Regenerate: pnpm --filter web gen:tokens
 * CI guard:   pnpm --filter web gen:tokens:check
 */

/* ── Colour: light ─────────────────────────────────────────── */
:root{
  color-scheme:light;
${light}

/* ── Geometry + motion: theme-independent ──────────────────── */
${geometryBlock()}
}

/* ── Colour: dark (system preference) ──────────────────────── */
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    color-scheme:dark;
${dark
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
  }
}

/* ── Colour: dark (explicit toggle) ────────────────────────── */
:root[data-theme="dark"]{
  color-scheme:dark;
${dark}
}

${themeMapBlock()}
${typeBlock()}`
}
