import { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { eq } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { ErrorCode, isCloudinaryUrl, LOCATIONS, isCityInCountry } from '@tenda/shared'
import type { UsersContract, ApiError } from '@tenda/shared'
import { ensureValidCoordinates, optionalName } from '@server/lib/validation'
import { AppError, requireBody } from '@server/lib/errors'
import { phoneVerifiedAt } from '@server/lib/auth/resolver'

type GetRoute    = UsersContract['get']
type UpdateRoute = UsersContract['update']

const userById: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('User not found', { code: ErrorCode.USER_NOT_FOUND }))

  // GET /v1/users/:id, public profile (no wallet_address)
  fastify.get<{
    Params: GetRoute['params']
    Reply: GetRoute['response'] | ApiError
  }>('/', async (request) => {
    const { id } = request.params

    const [user] = await fastify.db
      .select({
        id:               users.id,
        first_name:       users.first_name,
        last_name:        users.last_name,
        avatar_url:       users.avatar_url,
        bio:              users.bio,
        country:          users.country,
        city:             users.city,
        latitude:         users.latitude,
        longitude:        users.longitude,
        review_score:     users.review_score,
        role:             users.role,
        is_seeker:        users.is_seeker,
        created_at:       users.created_at,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!user) throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')

    // phone_verified_at is the public "verified human" signal, now derived
    // from the verified phone identity (the users column was dropped at S9A).
    return { ...user, phone_verified_at: await phoneVerifiedAt(fastify.db, id) }
  })

  // PATCH /v1/users/:id, update own profile.
  // Profile-text moderation is report-driven (stage-6 scope decision),
  // the legacy keyword guard died with blocked_keywords at the cutover.
  fastify.patch<{
    Params: UpdateRoute['params']
    Body: UpdateRoute['body']
    Reply: UpdateRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = request.params

    if (id !== request.user.id) throw new AppError(403, ErrorCode.FORBIDDEN, 'Can only update your own profile')

    const { first_name, last_name, avatar_url, bio, country, city, latitude, longitude } = requireBody(request.body)

    // Reject avatar URLs that don't come from Cloudinary CDN
    if (avatar_url !== undefined && avatar_url !== null && !isCloudinaryUrl(avatar_url)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'avatar_url must be a Cloudinary URL (https://res.cloudinary.com/)')
    }

    ensureValidCoordinates(latitude, longitude)

    if (country !== undefined && country !== null && !(country in LOCATIONS)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `country must be one of: ${Object.keys(LOCATIONS).join(', ')}`)
    }

    // The SAME validator PATCH /v1/users/me uses — this is the other
    // self-service write path for the same two columns, and a name stored
    // through one has to mean the same thing as a name stored through the
    // other. This route had no name validation at all: an over-long value went
    // straight to the column, and a null came back a 500 from the NOT NULL
    // constraint. See lib/validation's `optionalName`.
    const trimmed_first = optionalName('first_name', first_name, 100)
    const trimmed_last = optionalName('last_name', last_name, 100)

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (trimmed_first !== undefined) updates.first_name = trimmed_first
    if (trimmed_last !== undefined)  updates.last_name  = trimmed_last
    if (avatar_url !== undefined) updates.avatar_url = avatar_url
    if (bio !== undefined)        updates.bio        = bio
    if (country !== undefined)    updates.country    = country
    if (city !== undefined)       updates.city       = city
    if (latitude !== undefined)   updates.latitude   = latitude
    if (longitude !== undefined)  updates.longitude  = longitude

    // Cross-validate country↔city pairing. We need the *effective* values after
    // this PATCH applies, a partial update may change one without the other.
    if (country !== undefined || city !== undefined) {
      const [existing] = await fastify.db
        .select({ country: users.country, city: users.city })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)
      const effectiveCountry = country !== undefined ? country : existing?.country ?? null
      const effectiveCity    = city    !== undefined ? city    : existing?.city    ?? null
      if (effectiveCity && !isCityInCountry(effectiveCountry, effectiveCity)) {
        // Country changed without a matching city, null the orphan rather than
        // rejecting the whole PATCH, so partial updates degrade gracefully.
        updates.city = null
      }
    }

    const [updated] = await fastify.db.update(users).set(updates).where(eq(users.id, id)).returning()

    return updated
  })
}

export default userById
