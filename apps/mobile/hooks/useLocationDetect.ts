import { useState } from 'react'
import * as Location from 'expo-location'
import { LOCATIONS, type CountryCode } from '@tenda/shared'

interface UseLocationDetectOptions {
  onDetected: (country: string, city: string) => void
}

interface UseLocationDetectResult {
  detect: () => Promise<void>
  detecting: boolean
  error: string | null
  clearError: () => void
}

/** Match a geocoded string against a list of city names (fuzzy, case-insensitive). */
function fuzzyMatchCity(candidate: string, cities: readonly string[]): string | undefined {
  const lower = candidate.toLowerCase()
  return cities.find((c) => {
    const cl = c.toLowerCase()
    return cl === lower || lower.includes(cl) || cl.includes(lower)
  })
}

export function useLocationDetect({ onDetected }: UseLocationDetectOptions): UseLocationDetectResult {
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function detect() {
    setDetecting(true)
    setError(null)

    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission denied, please select manually.')
        return
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
      })

      const isoCode = geocode?.isoCountryCode?.toUpperCase()
      if (!isoCode || !(isoCode in LOCATIONS)) {
        setError(
          `${geocode?.country ?? 'Your country'} is not supported yet, please select manually.`,
        )
        return
      }

      const entry = LOCATIONS[isoCode as CountryCode]
      const candidates = [
        geocode.subregion,
        geocode.region,
        geocode.city,
        geocode.district,
      ].filter(Boolean) as string[]

      const city = candidates.reduce<string | undefined>(
        (found, c) => found ?? fuzzyMatchCity(c, entry.cities),
        undefined,
      )

      if (city) {
        onDetected(isoCode, city)
      } else {
        setError(
          `"${candidates[0] ?? 'your city'}" is not in our supported cities yet, please select manually.`,
        )
      }
    } catch {
      setError('Could not detect location, please select manually.')
    } finally {
      setDetecting(false)
    }
  }

  return { detect, detecting, error, clearError: () => setError(null) }
}
