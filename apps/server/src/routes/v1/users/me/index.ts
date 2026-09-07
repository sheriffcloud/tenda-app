/**
 * /v1/users/me (stage-1-onboarding.md):
 *   GET   → user + wallets[] + profile_complete
 *   PATCH → profile fields (first_name, last_name, country, city, bio,
 *           avatar_url, is_seeker). Phone changes go through the OTP
 *           routes, never here; wallet changes through link/unlink.
 *
 * profile_complete = first_name AND last_name set, via the shared
 * `hasCompleteName` — the same predicate `requireProfileComplete` enforces on
 * the create/accept surface and mobile routes on, so the three cannot drift.
 * Names are trimmed on write (lib/validation's `optionalName`, shared with the
 * other write path) so the stored value and the
 * predicate agree about what "set" means.
 */

import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { ErrorCode, hasCompleteName } from '@tenda/shared'
import { user_wallets, users } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { phoneVerifiedAt } from '@server/lib/auth/resolver'
import { optionalName, optionalString } from '@server/lib/validation'

interface PatchBody {
  first_name?: unknown
  last_name?: unknown
  country?: unknown
  city?: unknown
  bio?: unknown
  avatar_url?: unknown
  is_seeker?: unknown
  advanced_mode_enabled?: unknown
}

const PUBLIC_COLUMNS = {
  id: users.id,
  first_name: users.first_name,
  last_name: users.last_name,
  bio: users.bio,
  avatar_url: users.avatar_url,
  country: users.country,
  city: users.city,
  role: users.role,
  is_seeker: users.is_seeker,
  advanced_mode_enabled: users.advanced_mode_enabled,
  created_at: users.created_at,
} as const

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const [user] = await fastify.db
      .select(PUBLIC_COLUMNS)
      .from(users)
      .where(eq(users.id, request.user.id))
      .limit(1)
    if (user === undefined) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'user no longer exists')
    }
    const wallets = await fastify.db
      .select({
        chain_ns: user_wallets.chain_ns,
        address: user_wallets.address,
        is_primary: user_wallets.is_primary,
        verified_at: user_wallets.verified_at,
      })
      .from(user_wallets)
      .where(eq(user_wallets.user_id, request.user.id))

    return {
      user: { ...user, phone_verified_at: await phoneVerifiedAt(fastify.db, request.user.id) },
      wallets,
      profile_complete: hasCompleteName(user.first_name, user.last_name),
    }
  })

  fastify.patch<{ Body: PatchBody }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const b = request.body ?? {}
      const patch: Partial<typeof users.$inferInsert> = {}

      const first_name = optionalName('first_name', b.first_name, 100)
      if (first_name !== undefined) patch.first_name = first_name
      const last_name = optionalName('last_name', b.last_name, 100)
      if (last_name !== undefined) patch.last_name = last_name
      const country = optionalString('country', b.country, 100)
      if (country !== undefined) patch.country = country
      const city = optionalString('city', b.city, 100)
      if (city !== undefined) patch.city = city
      const bio = optionalString('bio', b.bio, 1000)
      if (bio !== undefined) patch.bio = bio
      const avatar_url = optionalString('avatar_url', b.avatar_url, 500)
      if (avatar_url !== undefined) patch.avatar_url = avatar_url
      if (b.is_seeker !== undefined) {
        if (typeof b.is_seeker !== 'boolean') {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'is_seeker must be a boolean')
        }
        patch.is_seeker = b.is_seeker
      }

      // CO4: unlocks the P2P exchange surface (order book + offer creation).
      if (b.advanced_mode_enabled !== undefined) {
        if (typeof b.advanced_mode_enabled !== 'boolean') {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'advanced_mode_enabled must be a boolean')
        }
        patch.advanced_mode_enabled = b.advanced_mode_enabled
      }
      if (Object.keys(patch).length === 0) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'no updatable fields supplied')
      }

      const [updated] = await fastify.db
        .update(users)
        .set(patch)
        .where(eq(users.id, request.user.id))
        .returning(PUBLIC_COLUMNS)
      if (updated === undefined) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'user no longer exists')
      }
      return {
        user: { ...updated, phone_verified_at: await phoneVerifiedAt(fastify.db, request.user.id) },
        profile_complete: hasCompleteName(updated.first_name, updated.last_name),
      }
    },
  )
}

export default route
