/**
 * Push-token registration. The critical invariant is that this path NEVER
 * prompts: it is called on every login, and prompting here is what used to
 * spend iOS's one-shot dialog before the user had any context for it.
 */
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { api } from '@/api/client'
import { getNotificationPermission } from '@/lib/notifications/permissions'
import {
  registerDeviceToken,
  removeDeviceToken,
  ensureAndroidChannel,
} from '@/lib/notifications/token'

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-123' } } } },
}))

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

jest.mock('@/api/client', () => ({
  api: { notifications: { registerToken: jest.fn(), removeToken: jest.fn() } },
}))

jest.mock('@/lib/notifications/permissions', () => ({
  getNotificationPermission: jest.fn(),
}))

const getPermissionMock = getNotificationPermission as jest.Mock
const getTokenMock = Notifications.getExpoPushTokenAsync as jest.Mock
const setChannelMock = Notifications.setNotificationChannelAsync as jest.Mock
const registerMock = api.notifications.registerToken as jest.Mock
const removeMock = api.notifications.removeToken as jest.Mock

function enabled(value: boolean) {
  getPermissionMock.mockResolvedValue({ enabled: value, canAskAgain: true, status: 'granted' })
}

/** expoConfig requires name+slug; only `extra` is under test. */
function setExpoExtra(extra: { eas?: { projectId?: string | number } }) {
  Constants.expoConfig = { name: 'tenda', slug: 'tenda', extra }
}

beforeEach(() => {
  Platform.OS = 'ios'
  setExpoExtra({ eas: { projectId: 'project-123' } })
  getTokenMock.mockResolvedValue({ data: 'ExponentPushToken[abc]' })
  registerMock.mockResolvedValue({ ok: true })
  removeMock.mockResolvedValue({ ok: true })
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('registerDeviceToken', () => {
  it('registers the token when permission is already granted', async () => {
    enabled(true)

    await expect(registerDeviceToken()).resolves.toBe('ExponentPushToken[abc]')
    expect(registerMock).toHaveBeenCalledWith({
      token: 'ExponentPushToken[abc]',
      platform: 'expo',
    })
  })

  it('no-ops without permission and never prompts', async () => {
    enabled(false)

    await expect(registerDeviceToken()).resolves.toBeNull()
    expect(getTokenMock).not.toHaveBeenCalled()
    expect(registerMock).not.toHaveBeenCalled()
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('bails out when the EAS projectId is missing rather than throwing', async () => {
    enabled(true)
    setExpoExtra({})

    await expect(registerDeviceToken()).resolves.toBeNull()
    expect(getTokenMock).not.toHaveBeenCalled()
  })

  it('rejects a non-string projectId', async () => {
    enabled(true)
    setExpoExtra({ eas: { projectId: 42 } })

    await expect(registerDeviceToken()).resolves.toBeNull()
  })

  it('rejects an empty projectId', async () => {
    enabled(true)
    setExpoExtra({ eas: { projectId: '' } })

    await expect(registerDeviceToken()).resolves.toBeNull()
  })

  it('swallows a server failure so login is never blocked by push', async () => {
    enabled(true)
    registerMock.mockRejectedValue(new Error('500'))

    await expect(registerDeviceToken()).resolves.toBeNull()
  })

  it('swallows a token-minting failure', async () => {
    enabled(true)
    getTokenMock.mockRejectedValue(new Error('no network'))

    await expect(registerDeviceToken()).resolves.toBeNull()
  })

  it('creates the Android channel before minting a token', async () => {
    Platform.OS = 'android'
    enabled(true)

    await registerDeviceToken()

    expect(setChannelMock).toHaveBeenCalledWith('default', expect.objectContaining({ name: 'Default' }))
    expect(setChannelMock.mock.invocationCallOrder[0]).toBeLessThan(
      getTokenMock.mock.invocationCallOrder[0],
    )
  })

  it('skips channel creation on iOS', async () => {
    enabled(true)

    await registerDeviceToken()

    expect(setChannelMock).not.toHaveBeenCalled()
  })
})

describe('ensureAndroidChannel', () => {
  it('passes a mutable vibration pattern the SDK can accept', async () => {
    Platform.OS = 'android'

    await ensureAndroidChannel()

    const [, config] = setChannelMock.mock.calls[0]
    expect(Array.isArray(config.vibrationPattern)).toBe(true)
    expect(config.vibrationPattern).toEqual([0, 250, 250, 250])
  })
})

describe('removeDeviceToken', () => {
  it('drops the token server-side', async () => {
    await removeDeviceToken('ExponentPushToken[abc]')

    expect(removeMock).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]' })
  })

  it('swallows failures so logout always completes', async () => {
    removeMock.mockRejectedValue(new Error('offline'))

    await expect(removeDeviceToken('t')).resolves.toBeUndefined()
  })
})
