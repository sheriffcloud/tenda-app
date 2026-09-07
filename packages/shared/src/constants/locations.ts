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

/** Look up which country a city belongs to. Returns undefined if not found. */
export function findCountryForCity(city: string): CountryCode | undefined {
  for (const [code, entry] of Object.entries(LOCATIONS)) {
    if ((entry.cities as readonly string[]).includes(city)) {
      return code as CountryCode
    }
  }
  return undefined
}

/** True if the given city is one of the supported cities for the given country. */
export function isCityInCountry(country: string | null | undefined, city: string | null | undefined): boolean {
  if (!country || !city) return false
  const entry = LOCATIONS[country as CountryCode]
  if (!entry) return false
  return (entry.cities as readonly string[]).includes(city)
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
