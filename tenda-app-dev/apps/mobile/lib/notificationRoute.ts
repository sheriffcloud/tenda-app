/**
 * Notification deep-linking + visual mapping. A notification's `data` bag
 * ({ screen, escrowId, kind, ... }, built server-side by lib/notify's
 * escrowPushData) drives both where a tap navigates and which icon/tone the
 * row shows — so neither is hardcoded in the row component.
 */

import { Bell, Handshake, ArrowLeftRight, Scale } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'

/** Route for a notification tap, or null when the notice isn't navigable. */
export function notificationRoute(data: Record<string, string> | null): string | null {
  if (data === null) return null
  const { screen, escrowId, kind } = data
  if (screen === 'escrow' && escrowId) {
    return kind === 'exchange' ? `/exchange/${escrowId}` : `/gig/${escrowId}`
  }
  if (screen === 'dispute' && escrowId) return `/dispute/${escrowId}`
  return null
}

/** Icon for a notification row, derived from its screen/kind. */
export function notificationIcon(data: Record<string, string> | null): LucideIcon {
  if (data === null) return Bell
  if (data.screen === 'dispute') return Scale
  if (data.screen === 'escrow') return data.kind === 'exchange' ? ArrowLeftRight : Handshake
  return Bell
}
