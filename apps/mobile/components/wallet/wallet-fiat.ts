import { fiatRatePerUnit, formatFiat, type SupportedCurrency } from '@tenda/shared'

type RateMap = Partial<Record<SupportedCurrency, number>>

/**
 * The "≈ ₦…" line under the wallet's USDC total, or null when it cannot be
 * priced HONESTLY.
 *
 * Priced by `fiatRatePerUnit`, the one rule every money surface converts
 * through: a stable divides out its own peg's leg of the cached rates, so USDC
 * needs no endpoint of its own — the SOL feed already carries the USD leg. No
 * number beats a wrong one, so a missing total (an asset this build cannot
 * scale), no rates yet (feed down, nothing cached) or a missing leg all answer
 * null and the hero shows nothing rather than a stale or invented figure.
 */
export function walletFiatLine(
  totalUsdc: number | null,
  rates: RateMap | null,
  currency: SupportedCurrency,
  assetId: string,
): string | null {
  if (totalUsdc === null) return null
  const perUnit = fiatRatePerUnit(rates, currency, assetId)
  if (perUnit === null) return null
  return `≈ ${formatFiat(totalUsdc * perUnit, currency)}`
}
