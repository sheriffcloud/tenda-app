/**
 * Consolidated Fastify type augmentations.
 *
 * Lives here (not inside individual plugin files) so module-augmentation
 * order doesn't depend on the order ts-node compiles plugins at runtime.
 * Before this file existed, `src/plugins/audit.ts` was failing typecheck
 * with `Property 'db' does not exist on FastifyInstance` because audit.ts
 * compiles before db.ts in some lazy paths and TS couldn't see the
 * augmentation declared inside db.ts.
 *
 * All Fastify decorators added by plugins should be declared here. Plugins
 * still IMPLEMENT the decorators; this file just types them.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppDatabase } from '../plugins/db'
// `UserRole` is intentionally NOT imported here. v1's enum and v2's
// `user_role_v2` enum differ (v2 renames 'dispute_resolver' → 'dispute_admin'
// + new values). Until #34 cutover removes the v1 schema, JWT.role is typed
// as `string` so both eras can mint/consume tokens. Restrict-to-v2-enum
// happens at #34.
import type { QueueService } from '../plugins/queue'
import type { ChainRegistry } from '../chains/types'
import type { ContractRegistry } from '../chains/contracts'
import type { WsBroadcaster } from '../lib/ws'
import type { QuoteCache } from '../features/fiat-rails/quote-cache'
import type { RealtimePublisher } from '../realtime'

declare module 'fastify' {
  interface FastifyInstance {
    /** Drizzle client, registered by `plugins/db.ts`. */
    db: AppDatabase

    /** JWT-auth preHandler, registered by `plugins/auth.ts`. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>

    /**
     * Optional JWT-auth preHandler (Stage 9 /auth/{challenge,verify}), no
     * Authorization header passes through anonymously; a present header is
     * fully validated. Registered by `plugins/auth.ts`.
     */
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>

    /**
     * Lenient identification for PUBLIC reads that are merely richer when the
     * caller is known (gig detail's `viewer` block). An absent OR unusable
     * bearer proceeds anonymously instead of 401-ing. Registered by
     * `plugins/auth.ts`.
     */
    identifyViewer: (request: FastifyRequest) => Promise<void>

    /** Bust the moderation blocklist cache, registered by `plugins/moderation.ts`. */
    invalidateBlocklistCache(): void

    /** BullMQ queue service, registered by `plugins/queue`. */
    queue: QueueService

    /** Fiat pre-commit quote cache (Redis), registered by `plugins/quote-cache.ts`. */
    quoteCache: QuoteCache

    /** In-process WS pub/sub, registered by `plugins/websocket.ts`. */
    wsBroadcast: WsBroadcaster

    /** Local + optional Redis cross-replica realtime publication. */
    realtime: RealtimePublisher

    /** Chain adapter registry, registered by `plugins/chains.ts`. */
    chains: ChainRegistry

    /**
     * Which escrow contracts each chain may transact with — current and
     * superseded. Registered by `plugins/chains.ts` beside `chains`, because a
     * transition has to be built against the contract holding THAT escrow's
     * funds, not whichever one is current (open_issues #89).
     */
    contracts: ContractRegistry
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string
      role: string
    }
    user: {
      id: string
      role: string
    }
  }
}
