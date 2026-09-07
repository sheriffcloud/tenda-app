/**
 * WEB's routing table for a notification's `data` bag. The `screen`
 * VOCABULARY is shared (NOTIFICATION_SCREEN — server push-builders and every
 * client agree on the words); the routing TABLE is deliberately per-client
 * (documented in shared/constants/notifications.ts: the same screen resolves
 * to different destinations per surface).
 *
 * Web's map stays client-specific because its route shapes differ from mobile
 * and admin, while its accepted payload fields come from the server builders.
 */
import { NOTIFICATION_SCREEN } from '@tenda/shared'

export function notificationRoute(data: Record<string, string> | null): string | null {
  if (data === null) return null
  const { screen, escrowId, kind, userId, intentId } = data
  if (screen === NOTIFICATION_SCREEN.escrow && escrowId) {
    // Both land in the WORKSPACE, like exchange always has — /gig/:id is the
    // public shell, and a notice's reader is signed in by definition. One URL
    // serves every recipient because the my-gigs pane branches on the viewer's
    // relationship (#49): parties get the dossier, a subscriber opening a
    // new-gig notice gets the listing body with the brief and the accept CTA.
    return kind === 'exchange' ? `/exchange/${escrowId}` : `/my-gigs/${escrowId}`
  }
  if (screen === NOTIFICATION_SCREEN.dispute && escrowId) return `/dispute/${escrowId}`
  if (screen === NOTIFICATION_SCREEN.chat && userId) return `/chat/${userId}`
  if (screen === NOTIFICATION_SCREEN.fiatIntent && intentId) return `/wallet/intents/${intentId}`
  return null
}
