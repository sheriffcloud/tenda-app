/**
 * The SERVER-SIDE deep-link contract: one `*PushData` builder per
 * `NOTIFICATION_SCREEN` member, no exceptions.
 *
 * The vocabulary is shared (so a producer cannot invent a screen no client
 * routes) and the param SHAPE is declared once here — `escrowId` never drifts
 * to `escrow_id` at one of the nine call sites that used to hand-write these
 * objects. Kept apart from the producers because this is what a notice SAYS,
 * not how it is sent, and adding a screen touches only this file.
 */

import { NOTIFICATION_SCREEN } from '@tenda/shared'
import type { EscrowKind } from '@tenda/shared'

/**
 * A notification's deep-link `data` bag. Matches `notifications.data`
 * (`jsonb().$type<Record<string, string>>()`) — jsonb is schemaless, so a
 * non-string value only surfaces as a client-side type lie, never a DB error.
 */
export type PushData = Record<string, string>

/**
 * Push `data` for an escrow deep-link — `kind` lets the app route /gig/:id vs
 * /exchange/:id. Single builder shared by the escrow fan-out and the expiry
 * notice so both emit the canonical { screen, escrowId, kind } shape the
 * mobile resolver understands.
 */
export function escrowPushData(escrow_id: string, kind: EscrowKind): PushData {
  return { screen: NOTIFICATION_SCREEN.escrow, escrowId: escrow_id, kind }
}

/**
 * Push `data` for the dispute thread. Carries BOTH ids on purpose: mobile
 * opens a dispute by its escrow (`/dispute/:escrowId`) while the admin
 * dashboard keys the mediation queue by `disputes.id`, so a payload with only
 * one of them is un-routable on the other surface.
 *
 * `dispute_id` is nullable because an escrow can be `disputed` on-chain with no
 * off-chain `disputes` row (the raise tx confirms, the triage upsert is a
 * separate write). Omitting the key beats inventing one: mobile still routes on
 * the escrow id, and the dashboard has no row to open anyway.
 */
export function disputePushData(escrow_id: string, dispute_id: string | null): PushData {
  return {
    screen: NOTIFICATION_SCREEN.dispute,
    escrowId: escrow_id,
    ...(dispute_id !== null ? { disputeId: dispute_id } : {}),
  }
}

/** Push `data` for a chat message — `userId` is the SENDER, for the thread header. */
export function chatPushData(conversation_id: string, sender_id: string): PushData {
  return { screen: NOTIFICATION_SCREEN.chat, conversationId: conversation_id, userId: sender_id }
}

/** Push `data` for a fiat on/off-ramp intent (stage 8 settled/failed notices). */
export function fiatIntentPushData(intent_id: string): PushData {
  return { screen: NOTIFICATION_SCREEN.fiatIntent, intentId: intent_id }
}
