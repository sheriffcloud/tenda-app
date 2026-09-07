/**
 * POST /v1/escrows/:id/assign — approval mode: the creator picks an applicant.
 *
 * State machine: open → accepted, creator-only, before accept_deadline. This
 * is the transition where the WORKER signs nothing, so everything that would
 * normally be checked at their accept has to be checked here on their behalf:
 * their wallet, and their gig capacity.
 *
 * The application row is NOT settled here. The route only builds an unsigned
 * transaction, and a signature the poster abandons must not burn the worker's
 * application — the event applier settles it atomically when the transaction
 * confirms. All this route does is place a short hold so the row cannot lapse
 * mid-signature.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode, type AssignWorkerBody } from '@tenda/shared'
import { AppError, requireBody } from '@server/lib/errors'
import { getPlatformConfig } from '@server/lib/platform'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { assertCanTransact, assertAssigneeHasWallet } from '@server/lib/auth/resolver'
import { guardTransition } from '@server/lib/escrow-routes'
import { buildEscrowTx } from '@server/lib/escrow'
import { assertWorkerGigCapacity } from '@server/features/capacity/guards'
import { assertAssignable } from '@server/features/applications/guards'
import { heldExpiry } from '@server/features/applications/service'
import { drizzleApplicationStore } from '@server/features/applications/store'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: AssignWorkerBody }>(
    '/',
    { preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('accept')] },
    async (request) => {
      const { worker_user_id } = requireBody(request.body)
      if (typeof worker_user_id !== 'string' || worker_user_id === '') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'worker_user_id is required')
      }
      const now = new Date()
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now,
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'assign_accept',
      })

      // AFTER the transition guard, so authorization is settled first: a
      // non-creator gets the same 403 whatever they put in the body, rather
      // than an error that varies with it.
      if (worker_user_id === request.user.id) {
        throw new AppError(
          422,
          ErrorCode.CANNOT_ACCEPT_OWN_GIG,
          'You cannot assign a gig to yourself',
        )
      }

      const adapter = fastify.chains.get(escrow.chain_id)
      // The POSTER is signing, so they need the transaction gate…
      await assertCanTransact(fastify.db, request.user.id, adapter.namespace)
      // …and the worker needs a wallet on this chain, because their address is
      // baked into the transaction. Same 422 shape as a direct-assign create.
      await assertAssigneeHasWallet(fastify.db, worker_user_id, adapter.namespace)

      // The worker cannot check their own capacity here — they are not the
      // caller — so the poster is stopped from overloading them instead.
      await assertWorkerGigCapacity(fastify.db, worker_user_id, escrow.kind)

      const store = drizzleApplicationStore(fastify.db)
      const application = await store.find(escrow.id, worker_user_id)
      assertAssignable(application, now)

      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'assignAccept',
        user_id: request.user.id,
        payload: { escrow_id: escrow.id, worker_user_id },
      })

      // Hold LAST: only once the transaction is built and every guard has
      // passed is there anything to protect. Extending earlier would move an
      // applicant's deadline for an assignment that then failed validation.
      await store.hold(application.id, heldExpiry(application.expires_at, now))

      return { unsigned }
    },
  )
}

export default route
