import { useState } from 'react'
import * as Location from 'expo-location'

export interface DeviceCoords {
  latitude: number
  longitude: number
}

/**
 * One device-position read, permission included — the raw-coordinates
 * sibling of useLocationDetect (which geocodes to country/city and is the
 * wrong tool when the COORDINATES are the value). Two callers: the composer
 * capturing a gig's check-in pin, and a worker checking in for a geotag
 * proof.
 *
 * `capture` resolves null on every failure path after setting `error`, so
 * callers branch on the value and never need their own try/catch.
 */
export function useDeviceCoords() {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function capture(): Promise<DeviceCoords | null> {
    setCapturing(true)
    setError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission denied — allow it in Settings to use this.')
        return null
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch {
      setError('Could not read your location. Try again.')
      return null
    } finally {
      setCapturing(false)
    }
  }

  return { capture, capturing, error }
}
