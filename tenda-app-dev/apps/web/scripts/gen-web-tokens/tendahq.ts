/**
 * The tendahq target: the same tokens as ONE declaration per colour,
 * `light-dark(light, dark)`, under `color-scheme: light dark` on the root.
 *
 * tendahq's ThemeProvider stamps `data-theme`, and styles/base.css maps the
 * stamp to `color-scheme`, so one block serves the system preference, the
 * explicit toggle, and any subtree that pins itself (the app screens pin
 * light). Web keeps three blocks because its Tailwind map wants the light
 * values on bare :root; this shape is what tendahq's hand copy already used,
 * and the #58 gate proved its computed output identical to that copy.
 *
 * NAMESPACE NOTE. `--radius-xs … --radius-xl` are also Tailwind v4's own
 * radius theme variables, so once this block loads, `rounded-md` means
 * mobile's radius.md (16px), not Tailwind's 6px — the same override web has
 * through its @theme map. That is the intent (Tailwind's scale IS mobile's
 * scale), and the gate caught the one place tendahq relied on the default.
 */
import { colors, type ColorScheme } from '../../../mobile/theme/tokens'
import { flattenScheme, geometryPairs, schemePairs } from './core'
import { typeBlock } from './typography'

/**
 * [property, light, dark] for every colour token tendahq receives — the
 * scheme minus the omitted groups (naming.ts). The light scheme drives the
 * set; a leaf with no dark counterpart is a token that exists in one theme
 * only — the exact "colour defined in a single theme block" bug — and is
 * refused rather than emitted half-blank. The schemes are parameters
 * (defaulting to mobile's) so that refusal can be tested.
 */
export function pairedScheme(
  light: ColorScheme = colors.light,
  darkScheme: ColorScheme = colors.dark,
): Array<[string, string, string]> {
  const dark = new Map(flattenScheme(darkScheme))
  return schemePairs(light)
    .map(([property, light]) => {
      const counterpart = dark.get(property)
      if (counterpart === undefined) {
        throw new Error(`tendahq tokens: ${property} has no dark value`)
      }
      return [property, light, counterpart]
    })
}

export function renderTendahq(): string {
  const colours = pairedScheme()
    .map(([property, light, dark]) => `    ${property}: light-dark(${light}, ${dark});`)
    .join('\n')
  const geometry = geometryPairs()
    .map(([property, value]) => `    ${property}: ${value};`)
    .join('\n')
  return `/* GENERATED from apps/mobile/theme/tokens.ts — do not edit.
 * Regenerate: pnpm --filter tendahq gen:tokens
 * CI guard:   pnpm --filter tendahq gen:tokens:check
 *
 * Every colour once, as light-dark(light, dark). \`color-scheme\` on the root
 * picks the side; the stamps in styles/base.css override it either way.
 * The type atoms (\`type-*\`) follow the root block; styles/type.css applies
 * them to the landing's class names.
 */
@layer base {
  :root {
    color-scheme: light dark;

    /* colour — mobile colors.light / colors.dark */
${colours}

    /* geometry + motion — mobile radius, spacing, shadows, motion */
${geometry}
  }
}

${typeBlock()}`
}
