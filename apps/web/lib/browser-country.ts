/**
 * Region guess from the browser locale — web's stand-in for mobile's
 * `getDeviceCountry` (both delegate to the shared derivation). Often the UI
 * language's region rather than where the user actually is, so it is only
 * ever a FALLBACK behind the account country, and it answers null unless
 * the region is a supported market: its only job is seeding pickers whose
 * options ARE `LOCATIONS`, and an unsupported "selected" country would pass
 * validation while the picker shows nothing.
 */
import { localeCountryOrNull, type CountryCode } from '@tenda/shared'

export function getBrowserCountry(
  locale: string = Intl.DateTimeFormat().resolvedOptions().locale,
): CountryCode | null {
  return localeCountryOrNull(locale)
}
