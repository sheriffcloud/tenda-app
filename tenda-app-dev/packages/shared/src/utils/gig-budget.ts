/**
 * The composer's budget field: what the reader may type, and what that means
 * in base units.
 *
 * Both clients had this logic inline and both had it wrong the same way —
 * `Math.round(parseFloat(text) * 10 ** decimals)`, which is float math on
 * money. For an 18-decimal asset the multiplication lands past 2^53 and the
 * result is an approximation of the budget somebody is about to escrow.
 *
 * It lives here rather than in either client because it is one rule about one
 * field, and a copy in each app is how the two drift apart.
 */
import { getAssetMeta } from '../constants/assets'
import { isAmountRaw } from './amount-raw'
import { formatUnits, parseUnits, sanitizeDecimalText } from './units'
import { gigAmountBounds } from './validation'

/** Decimals for an asset, with the same 9dp fallback the bounds use. */
function assetDecimals(asset: string): number {
  return getAssetMeta(asset)?.decimals ?? 9
}

/** What the budget field may contain, at the asset's own precision. */
export function sanitizeGigBudgetText(typed: string, asset: string): string {
  return sanitizeDecimalText(typed, assetDecimals(asset))
}

/**
 * How many decimals a fiat entry may carry. Every currency the app supports
 * is a 2-decimal currency; this is named rather than typed inline so the day
 * a 0-decimal one is added there is one place to look.
 */
export const FIAT_ENTRY_DECIMALS = 2

/**
 * Field text → base units. '' when there is no amount yet, which is the
 * composer's "not set" and what the budget requirement refuses.
 *
 * Never clamps. A budget over the rail stays exactly as typed and is refused
 * by GIG_REQUIREMENTS.budget with a message that names the rail — clamping it
 * down silently would change the number after the reader stopped looking at
 * it.
 */
export function gigBudgetToRaw(text: string, asset: string): string {
  // parseUnits wants digits on BOTH sides of the point, and a field being
  // typed into routinely has only one: '12.' on the way to 12.5, and '.5'
  // straight off a decimal pad. Neither is malformed — but left alone, each
  // reads as UNSET while the field visibly shows a number, so the reader gets
  // 'Set a budget' pointing at their budget.
  const trimmed = text.trim().replace(/\.$/, '')
  const normalised = trimmed.startsWith('.') ? `0${trimmed}` : trimmed
  if (normalised === '' || normalised === '0.') return ''
  return parseUnits(normalised, assetDecimals(asset)) ?? ''
}

/**
 * Base units → field text. '' for "not set", so the field starts empty.
 *
 * Anything that is not a canonical non-negative base-unit string also comes
 * back as '', rather than throwing. Both clients call this during RENDER to
 * seed the field from `draft.amount_raw`, a server value: `formatUnits` runs
 * BigInt() on it, which throws on 'abc' / '1.5' / a JSON null, and a throw
 * inside a useState initialiser is a white screen on mount instead of a form
 * that can say something. A negative is refused for the same reason it is not
 * a budget — it used to render as '-0.00000000000000000'.
 */
export function gigBudgetToText(raw: string, asset: string): string {
  if (!isAmountRaw(raw)) return ''
  return formatUnits(raw, assetDecimals(asset))
}

/** The rail as the reader would read it, e.g. "1 – 50000 USDC". */
export function gigBudgetRangeLabel(asset: string): string {
  const { min_raw, max_raw } = gigAmountBounds(asset)
  const symbol = getAssetMeta(asset)?.symbol ?? asset
  return `${gigBudgetToText(min_raw, asset)} – ${gigBudgetToText(max_raw, asset)} ${symbol}`
}

/**
 * Whether a budget has actually been set — a canonical base-unit string above
 * zero.
 *
 * The predicate both clients need before showing a fee breakdown or asking
 * the moderation endpoint about an amount, replacing the `paymentRaw > 0`
 * each of them had inline.
 *
 * Not merely `!== ''`: this is the boundary where a raw amount that came from
 * a draft, a query string or a half-migrated caller is checked for CANONICAL
 * form before anything does BigInt arithmetic on it. `BigInt('1.5')` throws,
 * which would take the composer down mid-render; `BigInt('')` is worse for
 * being quiet — it is 0n, an amount of zero rather than no amount.
 */
export function hasGigBudget(raw: string): boolean {
  return isAmountRaw(raw) && BigInt(raw) > 0n
}

/** Where Number.prototype.toFixed switches to exponential notation. */
const MAX_FIXED_NOTATION = 1e21

/**
 * A budget arrived at by CONVERSION rather than typed — mobile's fiat entry
 * mode, where the reader types ₦500,000 and an exchange rate turns it into
 * asset units.
 *
 * The division by a rate is float arithmetic and cannot be anything else — a
 * rate is a float. What this contains is the damage: the quotient is fixed to
 * the asset's precision FIRST, so the base-unit string is exact for the
 * display amount actually shown, instead of `Math.round(units * 10 ** 18)`
 * inventing digits below it.
 *
 * `toFixed` rather than String(): String(0.0000001) is '1e-7', and an
 * exponent reaching parseUnits is a silent '' — a budget that vanishes.
 * `toFixed` only avoids that BELOW 1e21, above which it returns exponential
 * notation itself, so that end is refused explicitly rather than left to a
 * property toFixed does not have. Nothing near it is a real budget: the rails
 * top out at 50,000.
 */
export function gigBudgetFromUnits(units: number, asset: string): string {
  if (!Number.isFinite(units) || units <= 0) return ''
  if (units >= MAX_FIXED_NOTATION) return ''
  return gigBudgetToRaw(units.toFixed(assetDecimals(asset)), asset)
}
