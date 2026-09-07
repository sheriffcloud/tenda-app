import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'

type PushData = Record<string, string>

/**
 * Resolve a tapped notification's data payload to an app route, or null when
 * it carries nothing routable. Pure + exported so the routing matrix is
 * unit-testable without the expo-notifications listener.
 *
 * Escrow lifecycle / new-gig / review pushes all use { screen: 'escrow',
 * escrowId, kind }; kind picks the gig vs exchange detail screen (a missing
 * kind falls back to /gig, matching pre-exchange payloads).
 */
export function resolveNotificationRoute(data: PushData | undefined): string | null {
  if (!data) return null
  if (data.screen === 'escrow' && data.escrowId) {
    return data.kind === 'exchange' ? `/exchange/${data.escrowId}` : `/gig/${data.escrowId}`
  }
  if (data.screen === 'gig' && data.gigId) return `/gig/${data.gigId}`
  if (data.screen === 'chat' && data.userId) return `/chat/${data.userId}`
  if (data.screen === 'dispute' && data.escrowId) return `/dispute/${data.escrowId}`
  return null
}

/**
 * Listens for notification taps and deep-links to the relevant screen.
 * Supported: { screen: 'escrow', escrowId, kind } (gig/exchange detail),
 * { screen: 'gig', gigId }, { screen: 'chat', userId } and
 * { screen: 'dispute', escrowId } (CO7 mediation thread).
 */
export function useNotificationDeepLink() {
  const router = useRouter()

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushData | undefined
      const route = resolveNotificationRoute(data)
      if (route !== null) router.push(route as Parameters<typeof router.push>[0])
    })
    return () => sub.remove()
  }, [router])
}
