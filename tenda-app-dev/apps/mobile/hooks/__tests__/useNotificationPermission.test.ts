/**
 * The facade over the permission store. Thin, but it is the API all three
 * consumers use, so a mis-wired selector here would be invisible to both the
 * store tests (which bypass it) and the component tests (which mock it).
 */
import { renderHook, act } from '@testing-library/react-native'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { useNotificationPermissionStore } from '@/stores/notification-permission.store'

/**
 * The store is the REAL one here — that is the point of this suite — and it
 * imports '@/lib/notifications', whose modules import the expo-notifications
 * SDK. That SDK is not inert on import: its DevicePushTokenAutoRegistration.fx
 * side-effect module registers a push-token listener at load, which warns that
 * Expo Go dropped Android push in SDK 53. Nothing here touches the SDK, so the
 * warning was pure noise over a native dependency this suite never wanted.
 *
 * Mocked at the SDK seam, not at '@/lib/notifications': cutting the barrel
 * would stub out the store's own collaborators and leave the facade asserting
 * against a store that no longer does anything. Empty on purpose — every
 * `Notifications.*` reference in lib/notifications sits inside a function
 * body, so nothing is dereferenced at import time, and a path that did reach
 * the SDK would throw here rather than pass on a silent stub.
 */
jest.mock('expo-notifications', () => ({}))

const ON = { enabled: true, canAskAgain: false }

beforeEach(() => {
  useNotificationPermissionStore.setState({ permission: null, registered: false, asking: false })
})

it('exposes the store permission', () => {
  useNotificationPermissionStore.setState({ permission: ON })

  const { result } = renderHook(() => useNotificationPermission())

  expect(result.current.permission).toEqual(ON)
})

it('re-renders when the store permission changes', () => {
  const { result } = renderHook(() => useNotificationPermission())
  expect(result.current.permission).toBeNull()

  act(() => {
    useNotificationPermissionStore.setState({ permission: ON })
  })

  expect(result.current.permission).toEqual(ON)
})

it('wires ask and refresh to the store actions, not to each other', () => {
  const ask = jest.fn()
  const refresh = jest.fn()
  useNotificationPermissionStore.setState({ ask, refresh })

  const { result } = renderHook(() => useNotificationPermission())

  expect(result.current.ask).toBe(ask)
  expect(result.current.refresh).toBe(refresh)
})
