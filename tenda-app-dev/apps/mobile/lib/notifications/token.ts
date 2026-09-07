import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { api } from '@/api/client'
import { getNotificationPermission } from './permissions'
import { ANDROID_CHANNEL } from './policy'

/** Android must have a channel before a push token can be issued. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.id, {
    name: ANDROID_CHANNEL.name,
    importance: Notifications.AndroidImportance.HIGH,
    // Spread to a mutable array, the SDK's signature is not readonly.
    vibrationPattern: [...ANDROID_CHANNEL.vibrationPattern],
    lightColor: ANDROID_CHANNEL.lightColor,
  })
}

function readProjectId(): string | null {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  // Narrow rather than cast, `extra` is an untyped config bag.
  return typeof projectId === 'string' && projectId !== '' ? projectId : null
}

/**
 * Register this device for push. The single place a token is minted and sent
 * to the server, both the auth lifecycle and the primer call through here.
 *
 * Deliberately never prompts: it no-ops unless permission is already granted,
 * so the one-shot OS dialog is only ever spent behind an explicit tap on our
 * primer. Safe to call repeatedly, the server upserts on the token.
 */
export async function registerDeviceToken(): Promise<string | null> {
  try {
    const { enabled } = await getNotificationPermission()
    if (!enabled) return null

    await ensureAndroidChannel()

    const projectId = readProjectId()
    if (projectId === null) {
      console.warn('[push] Missing EAS projectId, cannot get push token')
      return null
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    await api.notifications.registerToken({ token, platform: 'expo' })
    return token
  } catch (e) {
    console.warn('[push] Failed to register push token:', e)
    return null
  }
}

/** Drop this device's token server-side, called on logout. */
export async function removeDeviceToken(token: string): Promise<void> {
  try {
    await api.notifications.removeToken({ token })
  } catch (e) {
    console.warn('[push] Failed to remove push token:', e)
  }
}
