/**
 * useDeviceCoords (web) — one Geolocation read. The contract the two callers
 * (composer pin capture, worker check-in) rely on: capture resolves the
 * coordinates on success and NULL on every failure path, with `error` set —
 * so callers branch on the value with no error handling of their own.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useDeviceCoords } from '@/hooks/useDeviceCoords'

type Success = (position: { coords: { latitude: number; longitude: number } }) => void
type Failure = (error: { code: number; PERMISSION_DENIED: number }) => void

function installGeolocation(impl: (ok: Success, fail: Failure) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn(impl) },
  })
}

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
})

test('a successful read resolves the coordinates and leaves error null', async () => {
  installGeolocation((ok) => ok({ coords: { latitude: 6.5, longitude: 3.4 } }))
  const { result } = renderHook(() => useDeviceCoords())
  let coords: unknown
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toEqual({ latitude: 6.5, longitude: 3.4 })
  expect(result.current.error).toBeNull()
  expect(result.current.capturing).toBe(false)
})

test('a denied permission resolves null with the permission message', async () => {
  installGeolocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }))
  const { result } = renderHook(() => useDeviceCoords())
  let coords: unknown = 'sentinel'
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toBeNull()
  expect(result.current.error).toMatch(/permission denied/i)
})

test('any other failure resolves null with the retryable message', async () => {
  installGeolocation((_ok, fail) => fail({ code: 2, PERMISSION_DENIED: 1 }))
  const { result } = renderHook(() => useDeviceCoords())
  let coords: unknown = 'sentinel'
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toBeNull()
  expect(result.current.error).toMatch(/could not read/i)
})

test('a browser without geolocation resolves null and says so — never throws', async () => {
  // afterEach leaves navigator.geolocation undefined; that IS this case.
  const { result } = renderHook(() => useDeviceCoords())
  let coords: unknown = 'sentinel'
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toBeNull()
  expect(result.current.error).toMatch(/cannot read your location/i)
})
