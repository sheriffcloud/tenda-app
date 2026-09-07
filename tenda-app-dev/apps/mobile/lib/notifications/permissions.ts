import * as Notifications from 'expo-notifications'
import { Linking } from 'react-native'

/**
 * The two facts every caller actually needs. The SDK's raw `status` is
 * deliberately not re-exposed: `enabled` already folds in iOS provisional
 * authorisation, so a caller comparing `status` directly would get it wrong.
 */
export interface NotificationPermission {
  /** True when the app may deliver notifications, iOS provisional included. */
  enabled: boolean
  /**
   * False once the OS will no longer surface the system prompt. The only
   * remaining route is the Settings app, asking again is a no-op.
   */
  canAskAgain: boolean
}

/**
 * iOS provisional authorisation delivers quietly to Notification Center without
 * ever showing a prompt, and reports `granted: false`. Treating that as "off"
 * would nag a user who is already receiving our notifications, so it counts as
 * enabled, mirroring the check documented in expo-notifications.
 */
export function toPermission(
  res: Notifications.NotificationPermissionsStatus,
): NotificationPermission {
  const isProvisional =
    res.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL

  return {
    enabled: res.granted || isProvisional,
    canAskAgain: res.canAskAgain,
  }
}

/** Read current permission. Has no user-facing effect. */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.getPermissionsAsync())
}

/**
 * Spend the system prompt. Callers must check `canAskAgain` first, on iOS this
 * resolves immediately with the existing answer once the prompt is spent.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.requestPermissionsAsync())
}

/**
 * Deep link to the app's OS settings page, the only way back for a user who has
 * denied (iOS) or turned notifications off outside the app (Android).
 */
export function openNotificationSettings(): void {
  void Linking.openSettings()
}
