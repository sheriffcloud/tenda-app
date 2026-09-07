import { create } from 'zustand'
import {
  getNotificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
  registerDeviceToken,
  type NotificationPermission,
} from '@/lib/notifications'
import { useAuthStore } from './auth.store'
import { useNotificationPromptStore } from './notification-prompt.store'

interface NotificationPermissionStore {
  /** Null until the first read lands. */
  permission: NotificationPermission | null
  /** True once a token is registered for the current enabled session. */
  registered: boolean
  /** In-flight guard: two mounted consumers must not raise two prompts. */
  asking: boolean
  /** Re-read from the OS. Called at boot and on every foreground. */
  refresh: () => Promise<NotificationPermission | null>
  /** The one sanctioned ask path. Resolves to whether notifications are on. */
  ask: () => Promise<boolean>
}

/** Native reads can reject; a failure must not take the caller down with it. */
async function read(): Promise<NotificationPermission | null> {
  try {
    return await getNotificationPermission()
  } catch (e) {
    console.warn('[push] Failed to read notification permission:', e)
    return null
  }
}

/**
 * Notification permission as shared state rather than per-component state.
 *
 * Previously every consumer of useNotificationPermission carried its own copy,
 * its own AppState listener and its own "already registered" flag, so a screen
 * with two consumers did two native reads per foreground and two registrations
 * on the off → on edge. One store means one of each, and gives `ask` a single
 * in-flight guard that per-component state could not provide.
 */
export const useNotificationPermissionStore = create<NotificationPermissionStore>((set, get) => {
  /** Adopt a freshly read permission, registering on the off → on edge. */
  async function adopt(next: NotificationPermission): Promise<NotificationPermission> {
    set({ permission: next })

    if (!next.enabled) {
      set({ registered: false })
      return next
    }
    if (get().registered) return next

    // Registration is per-user, so a granted permission with nobody signed in
    // has nothing to register yet; usePushToken picks it up on login.
    if (!useAuthStore.getState().isAuthenticated) return next

    // Latched before the await so concurrent foregrounds cannot double
    // register, then released again on failure: registerDeviceToken() swallows
    // its errors and answers null, and leaving the flag set would strand the
    // device with no token until the next cold start.
    set({ registered: true })
    const token = await registerDeviceToken()
    if (token === null) set({ registered: false })

    await useNotificationPromptStore.getState().reset()
    return next
  }

  return {
    permission: null,
    registered: false,
    asking: false,

    refresh: async () => {
      const next = await read()
      return next === null ? null : adopt(next)
    },

    /**
     * Routes to the OS Settings app only when the prompt is already spent. A
     * user who has just tapped "Don't allow" is left alone rather than being
     * bounced into Settings, which reads as punishment for their answer.
     */
    ask: async () => {
      if (get().asking) return get().permission?.enabled ?? false
      set({ asking: true })

      try {
        const current = await read()
        if (current === null) return false

        if (current.enabled) {
          await adopt(current)
          return true
        }
        if (!current.canAskAgain) {
          set({ permission: current })
          openNotificationSettings()
          return false
        }

        try {
          const next = await adopt(await requestNotificationPermission())
          return next.enabled
        } catch (e) {
          // A rejected prompt is indistinguishable from a refusal to the caller,
          // but it must never surface as an unhandled rejection from onPress.
          console.warn('[push] Permission request failed:', e)
          return false
        }
      } finally {
        set({ asking: false })
      }
    },
  }
})
