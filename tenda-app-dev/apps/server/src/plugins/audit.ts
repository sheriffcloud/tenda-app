// Fastify plugin that centralises all admin audit-log writes.
// Route handlers emit typed 'admin.*' events, this plugin is the single place
// that translates them into admin_audit_log rows. Follows the same pattern as
// plugins/notifications.ts (event-driven, fire-and-forget per listener).
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { admin_audit_log } from '@tenda/shared/db/schema'
import { appEvents } from '@server/lib/events'

const auditPlugin: FastifyPluginAsync = async (fastify) => {
  // JSON-serializable value, used only internally for the jsonb metadata column.
  type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

  async function write(
    adminId: string,
    adminRole: string,
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: { [k: string]: JsonValue },
  ): Promise<void> {
    await fastify.db.insert(admin_audit_log).values({
      admin_id: adminId,
      admin_role: adminRole,
      action,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
      metadata: metadata ?? null,
    })
  }

  // ── User management ────────────────────────────────────────────────────────

  appEvents.on('admin.suspend_user', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'suspend_user', 'user', d.userId, {
        previous_status: d.previousStatus,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.suspend_user write failed')
    }
  })

  appEvents.on('admin.reinstate_user', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'reinstate_user', 'user', d.userId)
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.reinstate_user write failed')
    }
  })

  appEvents.on('admin.change_role', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'change_role', 'user', d.userId, {
        previous_role: d.previousRole,
        new_role: d.newRole,
        released_disputes: d.releasedDisputes,
        revoked_login: d.revokedLogin,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.change_role write failed')
    }
  })

  appEvents.on('admin.grant_login_email', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'grant_login_email', 'user', d.userId, {
        email: d.email,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.grant_login_email write failed')
    }
  })

  appEvents.on('admin.revoke_login_email', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'revoke_login_email', 'user', d.userId)
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.revoke_login_email write failed')
    }
  })

  // ── Platform config ────────────────────────────────────────────────────────

  appEvents.on('admin.update_platform_config', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'update_platform_config', 'platform_config', undefined, {
        changes: d.changes,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.update_platform_config write failed')
    }
  })

  // ── Reports ────────────────────────────────────────────────────────────────

  appEvents.on('admin.action_report', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'action_report', 'report', d.reportId, {
        new_status: d.newStatus,
        admin_note: d.adminNote ?? null,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.action_report write failed')
    }
  })

  appEvents.on('admin.set_escrow_hidden', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'set_escrow_hidden', 'escrow', d.escrowId, {
        hidden: d.hidden,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.set_escrow_hidden write failed')
    }
  })

  appEvents.on('admin.claim_dispute', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'claim_dispute', 'dispute', d.disputeId)
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.claim_dispute write failed')
    }
  })

  appEvents.on('admin.release_dispute', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'release_dispute', 'dispute', d.disputeId, {
        previous_assignee: d.previousAssignee,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.release_dispute write failed')
    }
  })

  appEvents.on('admin.propose_resolution', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'propose_resolution', 'dispute', d.disputeId, {
        resolution_id: d.resolutionId,
        winner: d.winner,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.propose_resolution write failed')
    }
  })

  appEvents.on('admin.reject_resolution', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'reject_resolution', 'dispute', d.disputeId, {
        resolution_id: d.resolutionId,
        reason: d.reason,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.reject_resolution write failed')
    }
  })

  appEvents.on('admin.create_featured_slot', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'create_featured_slot', 'escrow', d.escrowId, {
        slot_id: d.slotId,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.create_featured_slot write failed')
    }
  })

  appEvents.on('admin.delete_featured_slot', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'delete_featured_slot', 'escrow', d.escrowId, {
        slot_id: d.slotId,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.delete_featured_slot write failed')
    }
  })

  // ── Marketing & announcements ──────────────────────────────────────────────

  appEvents.on('admin.create_announcement', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'create_announcement', 'announcement', d.announcementId, {
        title: d.title,
        priority: d.priority,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.create_announcement write failed')
    }
  })

  appEvents.on('admin.update_announcement', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'update_announcement', 'announcement', d.announcementId, {
        title: d.title,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.update_announcement write failed')
    }
  })

  appEvents.on('admin.delete_announcement', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'delete_announcement', 'announcement', d.announcementId, {
        title: d.title,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.delete_announcement write failed')
    }
  })

  appEvents.on('admin.broadcast_push', async (d) => {
    try {
      await write(d.adminId, d.adminRole, 'broadcast_push', 'push', undefined, {
        target: d.target,
        attempted_count: d.attemptedCount,
      })
    } catch (err) {
      fastify.log.warn({ err }, '[audit] admin.broadcast_push write failed')
    }
  })
}

export default fp(auditPlugin)
