import type { SupportedCurrency } from '../../constants/currencies'
import type { PayoutCountrySpec, PayoutRailKind, PayoutRailSpec } from './types'
import { NG_PAYOUT } from './ng'
import { KE_PAYOUT } from './ke'
import { GH_PAYOUT } from './gh'
import { ZA_PAYOUT } from './za'
import { PH_PAYOUT } from './ph'
import { AE_PAYOUT } from './ae'

export * from './types'
export { GH_MOMO_NETWORKS } from './gh'
export { PH_WALLET_NETWORKS } from './ph'

/**
 * The payout countries, keyed by ISO 3166-1 alpha-2.
 *
 * Adding a market is this entry plus one spec file — every downstream surface
 * derives: SUPPORTED_PAYOUT_COUNTRIES, PAYOUT_CURRENCIES, the mobile country
 * picker, and the server's field validation.
 *
 * ONE SURFACE DOES NOT FOLLOW, and it is admin-only. `fiat_providers` is seeded
 * with `onConflictDoNothing` because its rows are operator-tunable, so on a
 * database that already has the `p2p_internal` row, the `capabilities` JSONB
 * keeps whatever currency list it was first seeded with. Quote ROUTING is
 * unaffected — `live-deps` builds the provider from P2P_INTERNAL_CAPABILITIES
 * in code, and `supportsRequest` reads that — so a new market works the moment
 * it is added. It is the admin config view that reads stale, which looks
 * exactly like the market not having taken. Re-seed that row deliberately if
 * an operator needs to see it.
 *
 * One country maps to exactly one currency, deliberately. A country that needs
 * two (a Nigerian holding both a naira account and a domiciliary dollar one)
 * would need the currency stored on `bank_accounts` rather than inferred from
 * the country — a schema change, not a spec file.
 *
 * DISABLING A MARKET is commenting its line out here. Everything below reads
 * this object, so that one edit removes it from `SUPPORTED_PAYOUT_COUNTRIES`,
 * `PAYOUT_CURRENCIES`, the p2p provider's advertised currencies, and the mobile
 * country picker. New payout accounts in that country are refused, and so are
 * new offers priced in its currency.
 *
 * Expect the tests that pin the current market list to fail when you do it.
 * That is the intended friction, not breakage: retiring a corridor should leave
 * a visible diff, so update them in the same commit. No count is given here on
 * purpose: an earlier draft of this line said "three", and adding one more test
 * in the same sitting made it seven.
 *
 * WHAT IT DOES NOT REACH, and why that is deliberate:
 *
 *   - OPEN OFFERS ALREADY IN THE BOOK stay listed and takeable. They are
 *     commitments made in good faith under the old rules, and they self-limit:
 *     each expires at its accept deadline and refunds. Auto-hiding them was
 *     considered and rejected — it would fire identically whether a market was
 *     retired for low volume or for a legal order, and in the first case it
 *     silently strands sellers who did nothing wrong. When the reason IS legal,
 *     the per-escrow takedown path is the tool: it is explicit, auditable, and
 *     scoped to the offers you actually mean.
 *   - ACCEPTED TRADES settle normally. The escrow is on-chain and the fiat leg
 *     is between the two parties; interrupting one strands money mid-flight.
 *   - SAVED ACCOUNTS in that country stay visible and stop working. The masking
 *     and `countryDisplayName` both handle an unknown country, so the row still
 *     renders — the user learns it is dead when they try to post.
 *   - The currency stays in SUPPORTED_CURRENCIES. It must: trades that already
 *     happened in it still have to format and price correctly.
 *   - THE LANDING SITE does not read this file. apps/tendahq keeps its own copy
 *     in src/data/currencies.ts, on purpose: the marketing site takes no
 *     workspace-package dependency, and its list is what to SHOW — it carries
 *     USD, GBP and EUR, which are not payout markets — so it is not this list
 *     under another name and should not be generated from it. Adding or
 *     retiring a market there is a separate, deliberate copy edit.
 *
 * There is no runtime toggle. `fiat_providers.is_enabled` disables a PROVIDER,
 * and chains have `chains.is_enabled` in the DB, but a payout market lives in
 * this file — so disabling one is a release, not a config change.
 */
export const PAYOUT_COUNTRY_SPECS: Readonly<Record<string, PayoutCountrySpec>> = {
  NG: NG_PAYOUT,
  KE: KE_PAYOUT,
  GH: GH_PAYOUT,
  ZA: ZA_PAYOUT,
  PH: PH_PAYOUT,
  AE: AE_PAYOUT,
}

/** Supported payout country codes, in registry order. */
export const SUPPORTED_PAYOUT_COUNTRIES: string[] = Object.keys(PAYOUT_COUNTRY_SPECS)

/**
 * The distinct currencies a set of country specs settles in, in registry order.
 *
 * Distinct is the whole job. One country settles in exactly one currency, but
 * one currency may serve several countries — the model allows it and the next
 * markets will use it — and a currency listed twice would show up twice in
 * every picker built from this. No pair of live markets shares a currency
 * today, so the registry cannot demonstrate that; a fixture can, which is why
 * this is a function and not an inline expression.
 */
export function derivePayoutCurrencies(specs: PayoutCountrySpec[]): SupportedCurrency[] {
  return [...new Set(specs.map((s) => s.currency))]
}

/**
 * The fiat currencies payouts settle in — DERIVED from the country specs so it
 * can never drift from the countries we actually support. Drives both the p2p
 * exchange's enabled currencies and the offramp currency validation.
 */
export const PAYOUT_CURRENCIES: SupportedCurrency[] = derivePayoutCurrencies(
  Object.values(PAYOUT_COUNTRY_SPECS),
)

/**
 * Country spec, or null when the country isn't a supported payout market.
 *
 * `Object.hasOwn` rather than a bare index: a plain object inherits from
 * Object.prototype, so `PAYOUT_COUNTRY_SPECS['__proto__']` — and 'constructor',
 * and 'toString' — answer with something TRUTHY that is not a spec, and the
 * `?? null` never fires. Callers gate on `getPayoutSpec(c) === null`, so those
 * three strings walked through a check meant to stop them.
 *
 * Not reachable through the API today: the bank-accounts route caps `country`
 * at two characters and upper-cases it before asking. That is a property of one
 * caller, though, and this function is exported and documented as answering
 * null for anything it does not know.
 */
export function getPayoutSpec(country: string): PayoutCountrySpec | null {
  return Object.hasOwn(PAYOUT_COUNTRY_SPECS, country) ? PAYOUT_COUNTRY_SPECS[country] : null
}

/**
 * The single fiat currency payouts settle in for a country — `null` when the
 * country is not a payout market, or not known yet.
 *
 * THERE IS NO DEFAULT, deliberately. This used to fall back to NGN, which was
 * wrong in two directions at once. On the server it turned "this account is in
 * a country we don't serve" into "this account is Nigerian", so an unrecognised
 * country silently satisfied the guard on an NGN-priced offer instead of
 * failing it. On mobile it printed a currency next to an empty payout field, so
 * the composer showed NGN to a Kenyan until they picked an account.
 *
 * Under a strict one-country-one-currency model the account always knows the
 * answer, so a fallback can only ever be a guess — and every caller here is
 * better served by handling the absence: the guards reject, and the UI shows
 * nothing until a payout account is chosen.
 */
export function payoutCurrencyForCountry(country: string | null): SupportedCurrency | null {
  return (country !== null ? getPayoutSpec(country)?.currency : undefined) ?? null
}

/**
 * How a country is NAMED to a reader: the spec's name where we have one, the
 * raw ISO code otherwise, and null when the account carries no country at all.
 *
 * The code is deliberately not hidden behind a placeholder. A trader's country
 * is part of deciding whether to trade with them, and "—" says less than "ZW"
 * does to the person reading it.
 */
export function countryDisplayName(country: string | null): string | null {
  if (country === null || country === '') return null
  return getPayoutSpec(country)?.countryName ?? country
}

/** A specific rail (bank / mobile_money) for a country, or null if unsupported. */
export function getPayoutRail(country: string, kind: PayoutRailKind): PayoutRailSpec | null {
  return getPayoutSpec(country)?.rails.find((r) => r.kind === kind) ?? null
}
