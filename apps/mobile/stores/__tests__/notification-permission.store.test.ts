/**
 * Notification permission as shared state. Covers every outcome of ask(), the
 * registration edge (including retry after a failed attempt), the in-flight
 * guard, and that a rejecting native module degrades instead of throwing.
 */
import {
  getNotificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
  registerDeviceToken,
} from '@/lib/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationPermissionStore } from '@/stores/notification-permission.store'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { INITIAL_PROMPT_STATE } from '@/lib/notifications/policy'

jest.mock('@/lib/notifications', () => ({
  getNotificationPermission: jest.fn(),
  requestNotificationPermission: jest.fn(),
  openNotificationSettings: jest.fn(),
  registerDeviceToken: jest.fn(),
}))

const getMock = getNotificationPermission as jest.Mock
const requestMock = requestNotificationPermission as jest.Mock
const settingsMock = openNotificationSettings as jest.Mock
const registerMock = registerDeviceToken as jest.Mock

const OFF_CAN_ASK = { enabled: false, canAskAgain: true }
const OFF_SPENT = { enabled: false, canAskAgain: false }
const ON = { enabled: true, canAskAgain: false }

const store = () => useNotificationPermissionStore.getState()

beforeEach(() => {
  useNotificationPermissionStore.setState({ permission: null, registered: false, asking: false })
  useNotificationPromptStore.setState({ ...INITIAL_PROMPT_STATE, hydrated: true })
  useAuthStore.setState({ isAuthenticated: true })
  getMock.mockResolvedValue(OFF_CAN_ASK)
  registerMock.mockResolvedValue('token')
})

describe('refresh', () => {
  it('adopts the current permission without prompting', async () => {
    await store().refresh()

    expect(store().permission).toEqual(OFF_CAN_ASK)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('registers a token on the off → on edge', async () => {
    getMock.mockResolvedValue(ON)

    await store().refresh()

    expect(registerMock).toHaveBeenCalledTimes(1)
    expect(store().registered).toBe(true)
  })

  it('registers only once across repeated foregrounds', async () => {
    getMock.mockResolvedValue(ON)

    await store().refresh()
    await store().refresh()
    await store().refresh()

    expect(registerMock).toHaveBeenCalledTimes(1)
  })

  it('retries registration on the next foreground after a failed attempt', async () => {
    // registerDeviceToken swallows its errors and answers null; latching the
    // flag anyway would strand the device with no token until a cold start.
    getMock.mockResolvedValue(ON)
    registerMock.mockResolvedValueOnce(null)

    await store().refresh()
    expect(store().registered).toBe(false)

    await store().refresh()

    expect(registerMock).toHaveBeenCalledTimes(2)
    expect(store().registered).toBe(true)
  })

  it('does not register while signed out, login handles it', async () => {
    useAuthStore.setState({ isAuthenticated: false })
    getMock.mockResolvedValue(ON)

    await store().refresh()

    expect(registerMock).not.toHaveBeenCalled()
    expect(store().permission).toEqual(ON)
  })

  it('clears the registration flag when permission is revoked', async () => {
    getMock.mockResolvedValue(ON)
    await store().refresh()

    getMock.mockResolvedValue(OFF_SPENT)
    await store().refresh()

    expect(store().registered).toBe(false)
  })

  it('degrades to null when the native read rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    getMock.mockRejectedValue(new Error('native module unavailable'))

    await expect(store().refresh()).resolves.toBeNull()
    expect(store().permission).toBeNull()
    warn.mockRestore()
  })
})

describe('ask', () => {
  it('prompts and registers when the user grants', async () => {
    requestMock.mockResolvedValue(ON)

    await expect(store().ask()).resolves.toBe(true)
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(registerMock).toHaveBeenCalledTimes(1)
  })

  it('stands every prompt down once granted', async () => {
    requestMock.mockResolvedValue(ON)
    useNotificationPromptStore.setState({ softDeclinedAt: 1, reminderCount: 2 })

    await store().ask()

    expect(useNotificationPromptStore.getState().softDeclinedAt).toBeNull()
    expect(useNotificationPromptStore.getState().reminderCount).toBe(0)
  })

  it('reports failure without bouncing a fresh denial into Settings', async () => {
    requestMock.mockResolvedValue(OFF_SPENT)

    await expect(store().ask()).resolves.toBe(false)
    // The user just answered "don't allow"; throwing them into Settings on top
    // of that reads as punishment for their answer.
    expect(settingsMock).not.toHaveBeenCalled()
  })

  it('routes to Settings instead of a dialog that can never appear', async () => {
    getMock.mockResolvedValue(OFF_SPENT)

    await expect(store().ask()).resolves.toBe(false)
    expect(settingsMock).toHaveBeenCalledTimes(1)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('short-circuits when permission is already enabled', async () => {
    getMock.mockResolvedValue(ON)

    await expect(store().ask()).resolves.toBe(true)
    expect(requestMock).not.toHaveBeenCalled()
    expect(settingsMock).not.toHaveBeenCalled()
  })

  it('raises only one prompt when two consumers ask at once', async () => {
    // Per-component state could not guarantee this: the primer and the nudge
    // banner are mounted together on the home screen.
    let release: (value: typeof ON) => void = () => {}
    requestMock.mockReturnValue(new Promise((resolve) => {
      release = resolve
    }))

    const first = store().ask()
    const second = store().ask()
    release(ON)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('clears the in-flight guard so a later ask still works', async () => {
    requestMock.mockResolvedValue(OFF_SPENT)
    await store().ask()
    expect(store().asking).toBe(false)

    requestMock.mockResolvedValue(ON)
    await expect(store().ask()).resolves.toBe(true)
  })

  it('resolves false when the read rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    getMock.mockRejectedValue(new Error('native module unavailable'))

    await expect(store().ask()).resolves.toBe(false)
    expect(requestMock).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('resolves false when the prompt itself rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    requestMock.mockRejectedValue(new Error('prompt failed'))

    // Must resolve rather than reject: onPress has nowhere to catch it.
    await expect(store().ask()).resolves.toBe(false)
    expect(store().asking).toBe(false)
    warn.mockRestore()
  })
})
