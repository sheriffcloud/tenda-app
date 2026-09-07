/**
 * The facade over the permission store. Thin, but it is the API all three
 * consumers use, so a mis-wired selector here would be invisible to both the
 * store tests (which bypass it) and the component tests (which mock it).
 */
import { renderHook, act } from '@testing-library/react-native'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { useNotificationPermissionStore } from '@/stores/notification-permission.store'

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
