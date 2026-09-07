import { EventEmitter } from 'node:events'

// ── Admin base shape ──────────────────────────────────────────────────────────
// v2 identity is multi-wallet: the durable admin identity is id + role
// (admin_audit_log mirrors this, no wallet column post-#34).

interface AdminEventBase {
  adminId: string
  adminRole: string
}

// ── Typed event map ────────────────────────────────────────────────────────
// Escrow lifecycle fan-out does NOT ride this emitter: verify-tx republish
// (workers/escrow-fanout) owns WS frames, operator alerts and party push.
// This map carries only the in-process events that have no on-chain trigger.

export interface AppEvents {
  'message.sent': {
    conversationId: string
    senderId: string
    recipientId: string
    preview: string
  }
  /**
   * The assigned worker stepped back off-chain. The escrow has NOT moved —
   * only the poster's `unassign` does that — so this exists to tell them the
   * gig needs their attention.
   */
  'escrow.assignment_released_offchain': {
    escrow_id: string
    creator_id: string
    worker_id: string
  }
  /**
   * A worker raised their hand on an approval-mode gig.
   *
   * Approval mode has no other poster-facing signal: applications land in a
   * table nobody is told about, so without this the poster would have to open
   * each of their gigs on the off-chance. The applicant, unlike an accepting
   * worker, sends no transaction — there is no chain event to fan out from,
   * which is why it rides this emitter and not verify-tx republish.
   */
  'gig.application_received': {
    escrow_id: string
    creator_id: string
    applicant_id: string
    /** gig_details.title — the poster may have several gigs open at once. */
    title: string
  }
  'review.submitted': {
    escrowId: string
    reviewerId: string
    revieweeId: string
    score: number
    /** gig_details.title; null for exchange escrows. */
    title: string | null
  }
  // Stage 8, fiat rails (onramp/offramp settlement fan-out)
  'fiat.settled': {
    intent_id: string
    user_id: string
    direction: 'onramp' | 'offramp'
    fiat_currency: string
    fiat_amount: string
    asset: string
    asset_amount_raw: string
  }
  'fiat.failed': {
    intent_id: string
    user_id: string
    direction: 'onramp' | 'offramp'
    fiat_currency: string
    fiat_amount: string
    asset: string
    asset_amount_raw: string
    reason: string
  }

  // ── Admin audit events ────────────────────────────────────────────────────
  // Each event carries AdminEventBase so the audit plugin can write a full
  // log entry without the route knowing anything about the audit table.
  'admin.suspend_user': AdminEventBase & { userId: string; previousStatus: string }
  'admin.reinstate_user': AdminEventBase & { userId: string }
  'admin.change_role': AdminEventBase & {
    userId: string
    previousRole: string
    newRole: string
    /** Claimed disputes returned to the pool when the new role can't mediate (A15). */
    releasedDisputes: number
    /** Dashboard login revoked because the new role is non-admin (#87). */
    revokedLogin: boolean
  }
  // #87, admin_users login registry provisioning (grant is LOGIN only,
  // never authority; see schema/identity.ts invariant)
  'admin.grant_login_email': AdminEventBase & { userId: string; email: string }
  'admin.revoke_login_email': AdminEventBase & { userId: string }
  'admin.update_platform_config': AdminEventBase & {
    changes: {
      fee_bps?: number
      seeker_fee_bps?: number
      grace_period_seconds?: number
      approval_window_seconds?: number
      default_sponsored_tx_count?: number
    }
  }
  'admin.action_report': AdminEventBase & { reportId: string; newStatus: string; adminNote?: string }
  'admin.set_escrow_hidden': AdminEventBase & { escrowId: string; hidden: boolean }
  'admin.claim_dispute': AdminEventBase & { disputeId: string }
  'admin.release_dispute': AdminEventBase & { disputeId: string; previousAssignee: string }
  'admin.propose_resolution': AdminEventBase & {
    disputeId: string
    resolutionId: string
    winner: 'creator' | 'counterparty' | 'split'
  }
  'admin.reject_resolution': AdminEventBase & {
    disputeId: string
    resolutionId: string
    reason: string
  }
  'admin.create_featured_slot': AdminEventBase & { slotId: string; escrowId: string }
  'admin.delete_featured_slot': AdminEventBase & { slotId: string; escrowId: string }
  'admin.create_announcement': AdminEventBase & {
    announcementId: string
    title: string
    priority: number
  }
  'admin.update_announcement': AdminEventBase & { announcementId: string; title: string }
  'admin.delete_announcement': AdminEventBase & { announcementId: string; title: string }
  'admin.broadcast_push': AdminEventBase & {
    target: string
    targetValue?: string
    attemptedCount: number
  }
}

class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): boolean {
    return super.emit(event as string, data)
  }

  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
    return super.on(event as string, listener)
  }

  off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
    return super.off(event as string, listener)
  }
}

// Singleton shared across the process.
export const appEvents = new TypedEventEmitter()
// audit (16) + notifications (4) listeners as of #87, keep headroom so
// new audit events and test-time capture listeners never trip the warning.
appEvents.setMaxListeners(32)
