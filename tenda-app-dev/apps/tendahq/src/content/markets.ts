/**
 * Fiat markets — DERIVED from the shared payout registry, the same specs the
 * server validates against, so the landing can never advertise a corridor the
 * product will refuse.
 *
 * THE DISTINCTION THIS FILE EXISTS TO KEEP:
 *
 *   - `SUPPORTED_CURRENCIES` is a DISPLAY preference — what you can see your
 *     balance quoted in. It is not a trading capability.
 *   - `PAYOUT_CURRENCIES` is what an offer can actually be denominated in.
 *     `routes/v1/exchange` requires a sell offer's `fiat_currency` to equal
 *     `payoutCurrencyForCountry(account.country)`, so the payout registry's
 *     countries are the whole set.
 *
 * The landing conflated the two and advertised "8 corridors". Deriving both
 * numbers from their real sources is what stops that recurring the next time
 * a currency is added for display only.
 *
 * NEITHER COUNT IS WRITTEN DOWN HERE, on purpose. An earlier version of this
 * docstring said "(8)" and "(3)". Both were true when typed and both went
 * stale — display gained AED, and payout gained South Africa, the Philippines
 * and the UAE — leaving the file that exists to prevent stale numbers stating
 * two of them. The values below derive; prose about them should not compete.
 */

import { PAYOUT_COUNTRY_SPECS, PAYOUT_CURRENCIES } from '@tenda/shared/fiat/payout'
import { SUPPORTED_CURRENCIES } from './currencies'
import { prose } from '@/lib/prose'

/** Currency codes an exchange offer can be denominated in, from the registry. */
export const TRADE_CURRENCIES: readonly string[] = PAYOUT_CURRENCIES

/** Country names we settle fiat in, in registry order. */
export const TRADE_COUNTRY_NAMES: readonly string[] = Object.values(PAYOUT_COUNTRY_SPECS).map(
  (spec) => spec.countryName,
)

/** The same countries as a sentence fragment. */
export const TRADE_COUNTRIES_PROSE = prose(TRADE_COUNTRY_NAMES)

/** The same currency codes as a sentence fragment. */
export const TRADE_CURRENCIES_PROSE = prose(TRADE_CURRENCIES)

/** How many markets fiat actually settles in today. */
export const TRADE_MARKET_COUNT = TRADE_COUNTRY_NAMES.length

/** How many currencies a balance can be DISPLAYED in — not a trading claim. */
export const DISPLAY_CURRENCY_COUNT = SUPPORTED_CURRENCIES.length
