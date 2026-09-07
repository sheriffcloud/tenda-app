/**
 * SDK-backed notification helpers.
 *
 * Deliberately does NOT re-export ./policy. That module is pure decision logic
 * with no expo-notifications dependency, and routing it through this barrel
 * would drag the SDK into every consumer of a constant (including their tests).
 * Import policy from '@/lib/notifications/policy' directly.
 */
export { configureNotifications } from './presentation'
export {
  getNotificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
} from './permissions'
export type { NotificationPermission } from './permissions'
export { registerDeviceToken, removeDeviceToken } from './token'
