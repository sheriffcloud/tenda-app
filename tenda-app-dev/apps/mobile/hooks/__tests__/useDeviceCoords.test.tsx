/**
 * useDeviceCoords — one position read, permission included. The contract the
 * two callers (composer pin capture, worker check-in) rely on: capture
 * resolves the coordinates on success and NULL on every failure path, with
 * `error` set — so callers can branch on the value with no try/catch.
 */
import { act, renderHook } from '@testing-library/react-native'

const mockRequestPermissions = jest.fn()
const mockGetPosition = jest.fn()
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockGetPosition(...a),
}))

import { useDeviceCoords } from '../useDeviceCoords'

beforeEach(() => {
  jest.clearAllMocks()
})

test('a granted read resolves the coordinates and leaves error null', async () => {
  mockRequestPermissions.mockResolvedValue({ status: 'granted' })
  mockGetPosition.mockResolvedValue({ coords: { latitude: 6.5, longitude: 3.4, accuracy: 10 } })
  const { result } = renderHook(() => useDeviceCoords())

  let coords: unknown
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toEqual({ latitude: 6.5, longitude: 3.4 })
  expect(result.current.error).toBeNull()
  expect(result.current.capturing).toBe(false)
})

test('a denied permission resolves null and says so — never throws', async () => {
  mockRequestPermissions.mockResolvedValue({ status: 'denied' })
  const { result } = renderHook(() => useDeviceCoords())

  let coords: unknown = 'sentinel'
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toBeNull()
  expect(result.current.error).toMatch(/permission denied/i)
  // The position API must not have been touched without permission.
  expect(mockGetPosition).not.toHaveBeenCalled()
})

test('a position failure resolves null with a retryable message', async () => {
  mockRequestPermissions.mockResolvedValue({ status: 'granted' })
  mockGetPosition.mockRejectedValue(new Error('gps off'))
  const { result } = renderHook(() => useDeviceCoords())

  let coords: unknown = 'sentinel'
  await act(async () => {
    coords = await result.current.capture()
  })
  expect(coords).toBeNull()
  expect(result.current.error).toMatch(/could not read/i)
})

test('a new capture clears the previous error', async () => {
  mockRequestPermissions.mockResolvedValueOnce({ status: 'denied' })
  const { result } = renderHook(() => useDeviceCoords())
  await act(async () => {
    await result.current.capture()
  })
  expect(result.current.error).not.toBeNull()

  mockRequestPermissions.mockResolvedValueOnce({ status: 'granted' })
  mockGetPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } })
  await act(async () => {
    await result.current.capture()
  })
  expect(result.current.error).toBeNull()
})
