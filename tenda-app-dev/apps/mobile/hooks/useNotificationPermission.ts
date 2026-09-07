import { useNotificationPermissionStore } from '@/stores/notification-permission.store'

/**
 * Reactive notification permission, plus the one sanctioned way to ask for it.
 *
 * A thin facade over the shared store so components keep a hook-shaped API.
 * The store owns the reads, the registration edge and the in-flight guard;
 * refreshing on foreground is handled once by useForegroundSync.
 */
export function useNotificationPermission() {
  const permission = useNotificationPermissionStore((s) => s.permission)
  const ask = useNotificationPermissionStore((s) => s.ask)
  const refresh = useNotificationPermissionStore((s) => s.refresh)

  return { permission, ask, refresh }
}
