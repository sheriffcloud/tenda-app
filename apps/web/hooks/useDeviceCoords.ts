'use client'

import { useState } from 'react'

export interface DeviceCoords {
  latitude: number
  longitude: number
}

/**
 * One browser-position read — web twin of mobile's useDeviceCoords
 * (expo-location there, the Geolocation API here). Two callers: the composer
 * capturing a gig's check-in pin, and a worker checking in for a geotag
 * proof.
 *
 * `capture` resolves null on every failure path after setting `error`, so
 * callers branch on the value and never need their own error handling.
 */
export function useDeviceCoords() {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function capture(): Promise<DeviceCoords | null> {
    setCapturing(true)
    setError(null)
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
        setError('This browser cannot read your location.')
        setCapturing(false)
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCapturing(false)
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        },
        (failure) => {
          setCapturing(false)
          setError(
            failure.code === failure.PERMISSION_DENIED
              ? 'Location permission denied — allow it in your browser to use this.'
              : 'Could not read your location. Try again.',
          )
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 15_000 },
      )
    })
  }

  return { capture, capturing, error }
}
