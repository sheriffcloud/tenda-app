'use client'

/**
 * Country + city pair for physical gigs — web analogue of mobile's
 * CountryCityPicker. Native selects instead of search sheets (the supported
 * location list is small and a <select> is the accessible browser idiom);
 * changing country clears the city so the pair can never be orphaned, same
 * invariant as mobile.
 */
import { LOCATIONS, type CountryCode } from '@tenda/shared'
import { controlClassName } from '@/components/ui/TextField'

const COUNTRIES = Object.entries(LOCATIONS) as [CountryCode, (typeof LOCATIONS)[CountryCode]][]

export function CountryCityPicker({
  country,
  city,
  onChange,
}: {
  country: string | null
  city: string | null
  onChange: (country: string, city: string | null) => void
}) {
  const entry = country !== null ? LOCATIONS[country as CountryCode] : undefined
  const cities = entry?.cities ?? []

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-control-input-label">
        Country
        <select
          className={controlClassName}
          value={country ?? ''}
          onChange={(e) => {
            const code = e.target.value
            if (code !== '' && code !== country) onChange(code, null)
          }}
        >
          <option value="" disabled>
            Select country
          </option>
          {COUNTRIES.map(([code, c]) => (
            <option key={code} value={code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-control-input-label">
        City
        <select
          className={controlClassName}
          value={city ?? ''}
          disabled={country === null}
          onChange={(e) => {
            if (country !== null && e.target.value !== '') onChange(country, e.target.value)
          }}
        >
          <option value="" disabled>
            {country !== null ? 'Select city' : 'Pick a country first'}
          </option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
