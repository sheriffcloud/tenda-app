/**
 * The colour tokens /foundations displays, DERIVED rather than listed.
 *
 * The comp hardcodes its swatch list. A hardcoded list on this page would be
 * the one bug this page exists to prevent: the point of a foundations page is
 * that it shows what the app actually ships, so a swatch that stopped matching
 * `tokens.css` would make the page confidently wrong. `schemePairs` is the
 * same transform `scripts/gen-web-tokens` runs to WRITE that file — the
 * scheme minus the groups it omits — so the names here cannot disagree with
 * the custom properties in it.
 *
 * The comp's page says "every value here is Appendix A verbatim". That is not
 * true of this app and shipping the sentence would be a lie: `tokens.css` is
 * generated from `apps/mobile/theme/tokens.ts`, and nine values deliberately
 * differ from the comps for contrast reasons (spec-correction #7). The page
 * says where the values come from instead.
 *
 * Values are NOT read here — only names. Each swatch paints itself with
 * `var(--token)`, so the theme toggle changes it with no re-render, which is
 * the behaviour the comp describes and the only way a light/dark page can be
 * one server render.
 */
import { colors } from '../../../mobile/theme/tokens'
import { schemePairs } from '../../scripts/gen-web-tokens/core'

export interface Swatch {
  /** The CSS custom property, e.g. `--brand-primary`. */
  name: string
}

export interface SwatchGroup {
  /** First path segment of the token name — `brand`, `surface`, `feedback`… */
  title: string
  swatches: Swatch[]
}

/**
 * Grouped by their first segment, in the order the scheme declares them —
 * that order is meaningful (brand before surface before content), and
 * re-sorting alphabetically would scatter each family.
 */
export function swatchGroups(): SwatchGroup[] {
  const groups: SwatchGroup[] = []
  // No value filter: `ColorScheme` types every leaf as a colour, and the
  // generator writes every one of them as a custom property — 80 hex and 24
  // rgba today. A "is this paintable" guard was written here first and turned
  // out to reject nothing, which made its test vacuous as well as its branch
  // dead. If a non-colour token ever joins the scheme, the type changes first.
  //
  // `schemePairs`, not `flattenScheme`: the generator omits the dead accent
  // group (#59e), and the unfiltered walk listed it here as three swatches
  // painted with custom properties that no longer exist — blank squares,
  // measured on the built page. This page shows what the sheet SHIPS.
  for (const [name] of schemePairs(colors.light)) {
    const title = name.replace(/^--/, '').split('-')[0]
    const group = groups.find((candidate) => candidate.title === title)
    if (group === undefined) groups.push({ title, swatches: [{ name }] })
    else group.swatches.push({ name })
  }
  return groups
}
