/**
 * The one read the card needs: address -> agent identity, or null.
 *
 * A PORT, not a query buried in the route, so the card can be built in a test
 * without a database and so this file is the only thing that knows the card is
 * backed by `user_wallets`/`users` at all.
 */

import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { users, user_wallets } from '@tenda/shared/db/schema'
import { formatFullName } from '@tenda/shared'
import { walletAddressEquals } from '@server/lib/auth/wallet-address'
import type { AgentIdentity } from './card'

export interface AgentCardStore {
  /** The agent owning this EVM address, or null when there is none. */
  findAgentByAddress(address: string): Promise<AgentIdentity | null>
}

export function drizzleAgentCardStore(db: FastifyInstance['db']): AgentCardStore {
  return {
    async findAgentByAddress(address) {
      const rows = await db
        .select({
          user_id: users.id,
          first_name: users.first_name,
          last_name: users.last_name,
          is_agent: users.is_agent,
          bio: users.bio,
          avatar_url: users.avatar_url,
        })
        .from(user_wallets)
        .innerJoin(users, eq(users.id, user_wallets.user_id))
        .where(
          and(
            eq(user_wallets.chain_ns, 'eip155'),
            // `walletAddressEquals`, NOT `eq(address, lowercased)`. Storage is
            // normalised GOING FORWARD only — legacy rows may still be
            // checksummed — so an exact match on a lowercased input silently
            // misses them, and for an address whose URI is committed on-chain a
            // silent miss is a permanently broken pointer. The helper's own
            // docblock records that trade and accepts the EVM seq scan; the
            // global 100 req/min/IP rate limit is what bounds it on a route
            // anyone may fetch.
            walletAddressEquals('eip155', address),
          ),
        )
        .limit(1)

      // `.limit(1)` BEFORE the is_agent test is safe, and not by luck: the
      // primary key is (chain_ns, address), and both write paths — link-wallet
      // and registerAgent — refuse an address any case-variant of which is
      // already held by ANYONE (they compare through this same helper). So one
      // EVM address is one row, and there is no human row that could be picked
      // ahead of an agent's.
      const row = rows[0]
      if (row === undefined) return null
      // A HUMAN's wallet must never answer here. The card carries a name, and
      // serving a person's name from an /agents/ URL because they happen to
      // hold that address would be a leak — a human reads as "not an agent",
      // which is the same minimal card an unknown address gets.
      if (!row.is_agent) return null
      // `formatFullName`, not `first_name` alone: an agent's whole name is in
      // `first_name` with `last_name` deliberately empty (registerAgent), but
      // the shared formatter is what every other surface uses and it already
      // drops the empty half. Reading the column directly would be a second,
      // quietly different, notion of an agent's name.
      // `bio` and `avatar_url` are nullable columns and are handed over as they
      // are. The card decides what an absent one becomes — it owns the required
      // -field fallbacks (#105), and a second notion of them here is how the
      // two drift.
      return {
        user_id: row.user_id,
        name: formatFullName(row.first_name, row.last_name),
        description: row.bio,
        image: row.avatar_url,
      }
    },
  }
}
