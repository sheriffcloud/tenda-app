/**
 * Push-token lifecycle.
 *
 * The first test is a regression guard: this hook used to call
 * requestPermissionsAsync() whenever the status was `undetermined`, which fired
 * the system dialog cold at app open and spent iOS's one-shot prompt before the
 * user had any context. The ask now belongs to the primer, and this hook must
 * stay silent.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native'
import * as Notifications from 'expo-notifications'
import { registerDeviceToken, removeDeviceToken } from '@/lib/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { usePushToken } from '@/hooks/usePushToken'

jest.mock('@/lib/notifications', () => ({
  registerDeviceToken: jest.fn(),
  removeDeviceToken: jest.fn(),
}))

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
}))

const registerMock = registerDeviceToken as jest.Mock
const removeMock = removeDeviceToken as jest.Mock

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false })
  registerMock.mockResolvedValue('ExponentPushToken[abc]')
  removeMock.mockResolvedValue(undefined)
})

it('never asks for permission', async () => {
  useAuthStore.setState({ isAuthenticated: true })

  renderHook(() => usePushToken())

  await waitFor(() => expect(registerMock).toHaveBeenCalled())
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
})

it('registers on login', async () => {
  renderHook(() => usePushToken())
  expect(registerMock).not.toHaveBeenCalled()

  await act(async () => {
    useAuthStore.setState({ isAuthenticated: true })
  })

  await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
})

it('drops the token on logout', async () => {
  useAuthStore.setState({ isAuthenticated: true })
  renderHook(() => usePushToken())
  await waitFor(() => expect(registerMock).toHaveBeenCalled())

  await act(async () => {
    useAuthStore.setState({ isAuthenticated: false })
  })

  await waitFor(() => expect(removeMock).toHaveBeenCalledWith('ExponentPushToken[abc]'))
})

it('does not attempt removal when no token was ever obtained', async () => {
  // Permission was never granted, so registration returned null.
  registerMock.mockResolvedValue(null)
  useAuthStore.setState({ isAuthenticated: true })
  renderHook(() => usePushToken())
  await waitFor(() => expect(registerMock).toHaveBeenCalled())

  await act(async () => {
    useAuthStore.setState({ isAuthenticated: false })
  })

  expect(removeMock).not.toHaveBeenCalled()
})
