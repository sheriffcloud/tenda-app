/**
 * Permission reads. The load-bearing case is iOS provisional authorisation:
 * it delivers notifications but reports `granted: false`, so a naive check
 * would classify an already-notified user as "off" and nag them forever.
 */
import * as Notifications from 'expo-notifications'
import { Linking } from 'react-native'
import {
  toPermission,
  getNotificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
} from '@/lib/notifications/permissions'

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
}))

jest.mock('react-native', () => ({
  Linking: { openSettings: jest.fn() },
}))

const getMock = Notifications.getPermissionsAsync as jest.Mock
const requestMock = Notifications.requestPermissionsAsync as jest.Mock
const openSettingsMock = Linking.openSettings as jest.Mock

type PermissionsResponse = Parameters<typeof toPermission>[0]

/**
 * Fixture shape kept loose on purpose: `status` is a string enum and the `ios`
 * block has eleven required fields, none of which `toPermission` reads. The
 * single cast is contained here rather than at every call site.
 */
interface ResponseOverrides {
  status?: 'granted' | 'denied' | 'undetermined'
  granted?: boolean
  canAskAgain?: boolean
  ios?: { status: number }
}

function response(overrides: ResponseOverrides = {}): PermissionsResponse {
  return {
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
    ...overrides,
  } as PermissionsResponse
}

describe('toPermission', () => {
  it('maps a granted response', () => {
    expect(toPermission(response())).toEqual({
      enabled: true,
      canAskAgain: true
    })
  })

  it('maps a denial, preserving that the prompt is spent', () => {
    const denied = response({ status: 'denied', granted: false, canAskAgain: false })

    expect(toPermission(denied)).toEqual({
      enabled: false,
      canAskAgain: false
    })
  })

  it('treats iOS provisional authorisation as enabled despite granted:false', () => {
    const provisional = response({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL },
    })

    expect(toPermission(provisional).enabled).toBe(true)
  })

  it('does not treat other iOS statuses as enabled', () => {
    const hardDenied = response({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      ios: { status: Notifications.IosAuthorizationStatus.DENIED },
    })

    expect(toPermission(hardDenied).enabled).toBe(false)
  })

  it('handles an absent ios block (Android)', () => {
    const androidDenied = response({ status: 'denied', granted: false, canAskAgain: true })

    expect(toPermission(androidDenied).enabled).toBe(false)
  })
})

describe('getNotificationPermission', () => {
  it('reads without prompting', async () => {
    getMock.mockResolvedValue(response({ status: 'undetermined', granted: false }))

    await expect(getNotificationPermission()).resolves.toEqual({
      enabled: false,
      canAskAgain: true
    })
    expect(requestMock).not.toHaveBeenCalled()
  })
})

describe('requestNotificationPermission', () => {
  it('spends the prompt and maps the answer', async () => {
    requestMock.mockResolvedValue(response())

    await expect(requestNotificationPermission()).resolves.toEqual({
      enabled: true,
      canAskAgain: true
    })
    expect(requestMock).toHaveBeenCalledTimes(1)
  })
})

describe('openNotificationSettings', () => {
  it('deep links to the OS settings page', () => {
    openNotificationSettings()

    expect(openSettingsMock).toHaveBeenCalledTimes(1)
  })
})
