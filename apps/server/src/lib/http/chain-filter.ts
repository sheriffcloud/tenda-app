/**
 * Shared `chain_id` list-filter guard for the browse surfaces (gigs,
 * exchange order book, user escrows). All three expose the same optional
 * CAIP-2 filter, so the validation lives here once rather than being
 * re-typed per route.
 *
 * The id is checked against the RUNNING chain registry, not a static list:
 * a well-formed but unprovisioned id (`solana:mainnet` on a devnet-only
 * deployment) must be a clean 400, never a silently empty page that reads
 * to the user as "no gigs on this chain". Same untrusted-input discipline
 * as the `chains.has` guards on the auth/blockchain routes (see ~~X5~~).
 */
import { eq, type SQL } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/**
 * The slice of `fastify.chains` this guard needs. Narrowed to a structural
 * type so the helper is unit-testable without booting the whole registry.
 */
export interface ChainFilterRegistry {
  has(chain_id: string): boolean
  list(): readonly { chain_id: string }[]
}

/**
 * Validate an optional `chain_id` querystring param and return the matching
 * SQL condition, or `null` when the caller didn't filter by chain.
 *
 * Throws 400 on an unregistered id, listing the enabled chains — mirroring
 * how `country` and `category` report their allowed values.
 */
export function chainFilterCondition(
  registry: ChainFilterRegistry,
  chain_id: string | undefined,
): SQL | null {
  if (chain_id === undefined || chain_id === '') return null
  if (!registry.has(chain_id)) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `chain_id must be one of: ${registry.list().map((c) => c.chain_id).join(', ')}`,
    )
  }
  return eq(escrows.chain_id, chain_id)
}
