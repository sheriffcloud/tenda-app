/**
 * Display currencies — DERIVED from @tenda/shared's CURRENCY_META, the same
 * vocabulary the server prices against and every client renders from.
 *
 * THIS FILE REPLACES A HAND-KEPT COPY, and the copy had already drifted: it
 * listed eight currencies against shared's nine, silently omitting AED. That
 * copy fed `DISPLAY_CURRENCY_COUNT`, so the landing rendered "8" for a product
 * that supports 9 — the exact class of false claim `markets.ts` was written to
 * prevent, reintroduced one import away from it.
 *
 * The copy justified itself with "kept inline so the marketing site has no
 * workspace-package dependency". That was not true when it was written: the
 * site imports @tenda/shared in ten places, including `markets.ts`, which
 * reads the payout registry from shared and the currencies from the copy in
 * the same file.
 *
 * Only the PROJECTION lives here — shared keys its metadata by code and this
 * site's components want the code on the object. Nothing about which
 * currencies exist, or what they are called, is decided in this file.
 */

import {
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  type SupportedCurrency,
} from '@tenda/shared/constants/currencies'

export { SUPPORTED_CURRENCIES }

export type CurrencyCode = SupportedCurrency

export interface CurrencyMeta {
  code: CurrencyCode
  symbol: string
  name: string
  flag: string
}

/**
 * Shared's metadata with the code folded onto each row.
 *
 * Built by mapping the vocabulary rather than by listing rows, so a currency
 * added to shared appears here with no edit — and one removed cannot linger.
 *
 * Fields are named one by one rather than spread. Shared's row also carries
 * `coingeckoKey`, which is a server pricing detail with no business on a
 * marketing page; a spread would have quietly attached it to every object
 * while the interface above claimed otherwise.
 *
 * `locale` is NOT projected. Shared carries one, and this file used to copy it,
 * but nothing on the landing has ever read it — not even the currency marquee
 * that was the obvious candidate, which formatted with a hardcoded 'en-US'.
 * Proved by deleting the field and the typechecker staying silent. `name` IS
 * kept: it is what the AED assertion checks identity against, so removing it
 * would leave that regression guarded by key membership alone.
 */
export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((code) => {
    const { symbol, name, flag } = CURRENCY_META[code]
    return [code, { code, symbol, name, flag }]
  }),
) as Record<CurrencyCode, CurrencyMeta>
