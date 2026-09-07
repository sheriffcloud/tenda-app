import { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { platform_config } from '@tenda/shared/db/schema'
import {
  ErrorCode,
  ESCROW_LIMITS,
  MAX_PENDING_GIGS_CEILING,
  MAX_OPEN_APPLICATIONS_CEILING,
  MIN_APPLICATION_TTL_SECONDS,
  MAX_APPLICATION_TTL_SECONDS,
} from '@tenda/shared'
import { requirePermission } from '@server/lib/guards'
import { AppError, requireBody } from '@server/lib/errors'
import { ensureIntInRange } from '@server/lib/validation'
import { ensureTxUpdated } from '@server/lib/db'
import { invalidatePlatformConfigCache } from '@server/lib/platform'
import { appEvents } from '@server/lib/events'
import type { AdminPlatformConfig, ApiError, UpdatePlatformConfigBody } from '@tenda/shared'

/**
 * Editable tunables come from the shared contract, so the route, the admin
 * client and the form cannot drift. `updated_at` is deliberately absent: the
 * table has no such column (the previous code set one, which Drizzle silently
 * dropped), and the audit trail is the `admin.update_platform_config` event.
 */
type PatchBody = UpdatePlatformConfigBody

const adminPlatformConfig: FastifyPluginAsync = async (fastify) => {
  // GET /v1/admin/platform-config
  fastify.get('/', {
    preHandler: [requirePermission('config.read')]
  }, async () => {
    const [row] = await fastify.db.select().from(platform_config).limit(1)
    if (!row) throw new AppError(404, ErrorCode.INTERNAL_ERROR, 'Platform config not found, seed the database first')
    return row
  })

  // PATCH /v1/admin/platform-config
  fastify.patch<{
    Body:  PatchBody
    Reply: AdminPlatformConfig | ApiError
  }>('/', {
    preHandler: [requirePermission('config.write')]
  }, async (request) => {
    const {
      fee_bps,
      seeker_fee_bps,
      grace_period_seconds,
      max_pending_gigs,
      unassign_window_seconds,
      max_open_applications,
      application_ttl_seconds,
    } = requireBody(request.body)

    // Fee/grace caps mirror the on-chain limits (ESCROW_LIMITS, guarded ==
    // both contracts) so an admin can't configure a value the contract would
    // revert: the contract caps platform fee at MAX_PLATFORM_FEE_BPS and grace
    // at MAX_GRACE_PERIOD_SECONDS, and the server's off-chain reclaim-window
    // math must stay within the window the chain actually enforces.
    // max_pending_gigs is purely off-chain, bounded by the same constant as the
    // column's CHECK so the route rejects before Postgres does.
    const {
      maxPlatformFeeBps,
      maxGracePeriodSeconds,
      minUnassignWindowSeconds,
      maxUnassignWindowSeconds,
    } = ESCROW_LIMITS

    ensureIntInRange(fee_bps, 'fee_bps', 0, maxPlatformFeeBps)
    ensureIntInRange(seeker_fee_bps, 'seeker_fee_bps', 0, maxPlatformFeeBps)
    ensureIntInRange(grace_period_seconds, 'grace_period_seconds', 0, maxGracePeriodSeconds)
    ensureIntInRange(max_pending_gigs, 'max_pending_gigs', 1, MAX_PENDING_GIGS_CEILING)
    // Same bound both contracts enforce: a window the chain would revert must
    // never reach an escrow's create call.
    ensureIntInRange(
      unassign_window_seconds,
      'unassign_window_seconds',
      minUnassignWindowSeconds,
      maxUnassignWindowSeconds,
    )
    // Bounded by the SAME constants as the columns' CHECKs, so the route
    // rejects before Postgres does and the operator gets a typed error.
    ensureIntInRange(max_open_applications, 'max_open_applications', 1, MAX_OPEN_APPLICATIONS_CEILING)
    ensureIntInRange(
      application_ttl_seconds,
      'application_ttl_seconds',
      MIN_APPLICATION_TTL_SECONDS,
      MAX_APPLICATION_TTL_SECONDS,
    )

    const fields = [
      'fee_bps',
      'seeker_fee_bps',
      'grace_period_seconds',
      'max_pending_gigs',
      'unassign_window_seconds',
      'max_open_applications',
      'application_ttl_seconds',
    ] as const satisfies readonly (keyof PatchBody)[]
    const changes: PatchBody = {
      ...(fee_bps !== undefined && { fee_bps }),
      ...(seeker_fee_bps !== undefined && { seeker_fee_bps }),
      ...(grace_period_seconds !== undefined && { grace_period_seconds }),
      ...(max_pending_gigs !== undefined && { max_pending_gigs }),
      ...(unassign_window_seconds !== undefined && { unassign_window_seconds }),
      ...(max_open_applications !== undefined && { max_open_applications }),
      ...(application_ttl_seconds !== undefined && { application_ttl_seconds }),
    }
    if (Object.keys(changes).length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Provide at least one of ${fields.join(', ')}`,
      )
    }

    const [updated] = await fastify.db
      .update(platform_config)
      .set(changes)
      .where(eq(platform_config.id, 1))
      .returning()

    const result = ensureTxUpdated(updated, 'Platform config not found, seed the database first')

    invalidatePlatformConfigCache()

    appEvents.emit('admin.update_platform_config', {
      adminId:     request.user.id,
      adminRole:   request.user.role,
      changes,
    })

    return result
  })
}

export default adminPlatformConfig
