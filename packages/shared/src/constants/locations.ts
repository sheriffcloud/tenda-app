export const LOCATIONS = {
  NG: {
    name: 'Nigeria',
    flag: '🇳🇬',
    currency: 'NGN',
    cities: [
      'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Benin City',
      'Kaduna', 'Enugu', 'Aba', 'Onitsha', 'Warri', 'Ilorin', 'Abeokuta',
      'Owerri', 'Uyo', 'Calabar', 'Asaba', 'Akure', 'Osogbo', 'Jos',
      'Maiduguri', 'Sokoto', 'Zaria', 'Makurdi', 'Awka',
    ],
  },
  GH: {
    name: 'Ghana',
    flag: '🇬🇭',
    currency: 'GHS',
    cities: ['Accra', 'Kumasi', 'Tamale', 'Takoradi', 'Cape Coast'],
  },
  KE: {
    name: 'Kenya',
    flag: '🇰🇪',
    currency: 'KES',
    cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'],
  },
  ZA: {
    name: 'South Africa',
    flag: '🇿🇦',
    currency: 'ZAR',
    cities: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth'],
  },
  PH: {
    name: 'Philippines',
    flag: '🇵🇭',
    currency: 'PHP',
    cities: ['Manila', 'Cebu City', 'Davao', 'Quezon City', 'Makati'],
  },
  US: {
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    cities: ['New York', 'Houston', 'Atlanta', 'Los Angeles', 'Washington DC', 'Chicago', 'Dallas', 'Boston'],
  },
  GB: {
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Bristol'],
  },
  DE: {
    name: 'Germany',
    flag: '🇩🇪',
    currency: 'EUR',
    cities: ['Berlin', 'Hamburg', 'Munich', 'Frankfurt', 'Cologne', 'Düsseldorf'],
  },
  NL: {
    name: 'Netherlands',
    flag: '🇳🇱',
    currency: 'EUR',
    cities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  },
  IE: {
    name: 'Ireland',
    flag: '🇮🇪',
    currency: 'EUR',
    cities: ['Dublin', 'Cork', 'Galway', 'Limerick'],
  },
} as const

export type CountryCode = keyof typeof LOCATIONS
export type LocationEntry = (typeof LOCATIONS)[CountryCode]

/** All city strings across every supported country. */
export const ALL_CITIES: string[] = Object.values(LOCATIONS).flatMap((l) => [...l.cities])

/**
 * Narrowing guard: is this string one of the supported market countries?
 *
 * `Object.hasOwn` rather than `in`, for the reason `getPayoutSpec` records
 * against the other vocabulary in this package: LOCATIONS is a plain object and
 * inherits from Object.prototype, so `'toString' in LOCATIONS` — and
 * 'constructor', and '__proto__' — answer TRUE. Every caller gates on this
 * guard, and `LOCATIONS['toString'].name` is then `Function.prototype.name`
 * rather than a country, so those strings walked through a check written to
 * stop them and reached the wire as `UserRef.country` / `GigSummary.country`,
 * which the published Agent API schema admits only the LOCATIONS keys for.
 */
export function isCountryCode(code: string): code is CountryCode {
  return Object.hasOwn(LOCATIONS, code)
}

/**
 * The supported-market country a BCP-47 locale suggests, or null. The ONE
 * derivation both clients' locale fallbacks use (web browser locale, mobile
 * device locale), clamped to LOCATIONS because its only job is seeding
 * pickers whose options ARE the supported markets — an unclamped region
 * ('FR') or a script subtag mistaken for one ('zh-Hans-CN' → 'HANS' under
 * the old naive split) reads as "country selected" to validation while the
 * picker shows nothing, soft-locking the city step.
 *
 * Pure subtag parsing rather than Intl.Locale (Hermes ships partial Intl):
 * per BCP 47 the region is the first 2-alpha or 3-digit subtag after the
 * language, so scripts ('Hans', 'Latn') can never masquerade as regions.
 */
export function localeCountryOrNull(locale: string): CountryCode | null {
  const region = locale
    .split('-')
    .slice(1)
    .find((tag) => /^[A-Za-z]{2}$/.test(tag) || /^\d{3}$/.test(tag))
    ?.toUpperCase()
  return region !== undefined && isCountryCode(region) ? region : null
}

/** Look up which country a city belongs to. Returns undefined if not found. */
export function findCountryForCity(city: string): CountryCode | undefined {
  for (const [code, entry] of Object.entries(LOCATIONS)) {
    if ((entry.cities as readonly string[]).includes(city)) {
      return code as CountryCode
    }
  }
  return undefined
}

/**
 * True if the given city is one of the supported cities for the given country.
 *
 * Gated on `isCountryCode`, not on the truthiness of the lookup: LOCATIONS
 * inherits from Object.prototype, so `LOCATIONS['toString']` is a FUNCTION —
 * truthy — and the old `if (!entry) return false` fell straight through to
 * `entry.cities.includes(city)`, which threw a TypeError. That reached the wire
 * as a 500 on POST /v1/gigs and POST /v1/agent/tasks for `country: 'toString'`
 * with any city. Same rule as `getPayoutSpec` in this package.
 */
export function isCityInCountry(country: string | null | undefined, city: string | null | undefined): boolean {
  if (!country || !city || !isCountryCode(country)) return false
  return (LOCATIONS[country].cities as readonly string[]).includes(city)
}

/**
 * Coerce a (country, city) pair into a consistent state. If the city does not
 * belong to the country, returns `null`. Use before persisting a user's location
 * to prevent orphan-city bugs (e.g. country=KE + city=Lagos).
 */
export function coerceCityForCountry(
  country: string | null | undefined,
  city: string | null | undefined,
): string | null {
  if (!city) return null
  if (isCityInCountry(country, city)) return city
  return null
}
