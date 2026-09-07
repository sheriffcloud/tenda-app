/**
 * Wallet-born agent accounts (#19). An autonomous agent has a key and no
 * phone, so the human sign-up path (OTP → account → link wallet) cannot
 * apply; this is the one place a wallet proof CREATES an account, and only
 * an `is_agent` one — decision #3 ("wallet signs in but never creates")
 * still holds for humans, whose sign-in the orchestrator owns.
 *
 * Find-or-create on the proven wallet: a wallet already linked to an agent
 * signs that agent back in (idempotent registration); a wallet linked to a
 * HUMAN is refused — it cannot be quietly converted, and the human's own
 * sign-in is where it belongs.
 */
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { ErrorCode, LOCATIONS, NAME_MAX_LENGTH, isCountryCode, type AgentRegisterBody, type User } from '@tenda/shared'
import { users, user_wallets } from '@tenda/shared/db/schema'
import { AppError, requireNonEmptyString } from '@server/lib/errors'
import { resolveUserByWallet } from '@server/lib/auth/resolver'
import { verifyWalletAuth } from '@server/lib/auth/strategies/wallet'

export interface AgentRegistration {
  user: User
  isNew: boolean
}

interface ParsedRegistration {
  proof: AgentRegisterBody
  name: string
  country: string | null
}

/** Shape-check the body (400 on a miss) — the wallet proof fields plus the agent's name. */
export function parseAgentRegistration(body: Partial<AgentRegisterBody>): ParsedRegistration {
  const name = requireNonEmptyString(body.name, 'name').trim()
  if (name === '' || name.length > NAME_MAX_LENGTH) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `name must be 1–${NAME_MAX_LENGTH} characters`)
  }
  let country: string | null = null
  if (body.country !== undefined) {
    // The shared guard, not `country in LOCATIONS`: a plain object inherits
    // from Object.prototype, so `in` admits 'toString' / 'constructor' /
    // '__proto__' as countries (proven — an agent registered with one).
    if (typeof body.country !== 'string' || !isCountryCode(body.country)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `country must be one of: ${Object.keys(LOCATIONS).join(', ')}`)
    }
    country = body.country
  }
  return {
    name,
    country,
    proof: {
      chain_id: requireNonEmptyString(body.chain_id, 'chain_id'),
      address: requireNonEmptyString(body.address, 'address'),
      message: requireNonEmptyString(body.message, 'message'),
      signature: requireNonEmptyString(body.signature, 'signature'),
      name,
    },
  }
}

async function loadUser(fastify: FastifyInstance, userId: string): Promise<User> {
  const [user] = await fastify.db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (user === undefined) throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'resolved user row missing')
  return user
}

export async function registerAgent(fastify: FastifyInstance, body: Partial<AgentRegisterBody>): Promise<AgentRegistration> {
  const { proof, name, country } = parseAgentRegistration(body)
  // The same proof the human wallet login runs: message, signature, single-use nonce.
  const { chain_ns, address } = await verifyWalletAuth(
    { chains: fastify.chains, db: fastify.db, now: () => new Date() },
    proof,
  )

  const ownerId = await resolveUserByWallet(fastify.db, { chain_ns, address })
  if (ownerId !== null) return signInExisting(fastify, ownerId)

  // Create needs a transaction for the orphan-rollback on a lost wallet race.
  return fastify.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      // The name is the only profile an agent has; `last_name` stays empty and
      // every display surface renders the badge beside it.
      .values({ first_name: name, is_agent: true, country })
      .returning()
    if (created === undefined) throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'user insert returned no row')
    const linked = await tx
      .insert(user_wallets)
      .values({ chain_ns, address, user_id: created.id, is_primary: true })
      .onConflictDoNothing()
      .returning({ user_id: user_wallets.user_id })
    if (linked.length > 0) return { user: created, isNew: true }
    // A concurrent registration of the same wallet won: roll back our orphan
    // and sign in as the winner (which the ownership rule below still vets).
    await tx.delete(users).where(eq(users.id, created.id))
    const winnerId = await resolveUserByWallet(tx, { chain_ns, address })
    if (winnerId === null) throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'wallet race winner not found')
    return signInExisting(fastify, winnerId)
  })
}

/** An already-linked wallet: an agent signs back in; a human's wallet is refused outright. */
async function signInExisting(fastify: FastifyInstance, userId: string): Promise<AgentRegistration> {
  const user = await loadUser(fastify, userId)
  if (!user.is_agent) {
    throw new AppError(
      409,
      ErrorCode.IDENTITY_ALREADY_LINKED,
      'this wallet belongs to a person, not an agent — sign in through /v1/auth/verify instead',
    )
  }
  return { user, isNew: false }
}
