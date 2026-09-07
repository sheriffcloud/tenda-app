/**
 * POST /v1/escrows/:id/accept, counterparty (or assigned counterparty)
 * accepts an open escrow.
 *
 * State machine: open → accepted, time-gated by accept_deadline.
 * Builds an `acceptEscrow` tx for the client to sign.
 */

import type { FastifyPluginAsync } from 'fastify'
import type { SignerPreferenceBody } from '@tenda/shared'
import { getPlatformConfig } from '@server/lib/platform'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { assertGigCapacity } from '@server/features/capacity/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { assertCanTransact } from '@server/lib/auth/resolver'
import { guardTransition } from '@server/lib/escrow-routes'
import { assertCallerWallet, buildEscrowTx, partyCaller, readSignerPreference } from '@server/lib/escrow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: SignerPreferenceBody | null }>(
    '/',
    { preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('accept')] },
    async (request) => {
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow, caller } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'accept',
      })
      const adapter = fastify.chains.get(escrow.chain_id)
      // First-transaction gate: the accepter needs a wallet on this chain + a
      // verified contact before they can enter the escrow.
      await assertCanTransact(fastify.db, request.user.id, adapter.namespace)
      // Concurrency cap: a worker may only hold so many live gigs at once.
      // Gig-only — an exchange accept is a trade, not a work commitment.
      await assertGigCapacity(fastify.db, request.user.id, escrow.kind)
      // Public accept is the free signer case: the wallet the client intends
      // to sign with becomes the counterparty on-chain — but only a wallet
      // this caller has verified may be baked in. (For an ASSIGNED accept the
      // adapter overrides with the chain-bound assignee and refuses a
      // mismatch by name.)
      const signer_address = readSignerPreference(request.body)
      if (signer_address !== undefined) {
        await assertCallerWallet(fastify.db, {
          user_id: request.user.id,
          chain_ns: adapter.namespace,
          address: signer_address,
        })
      }
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'acceptEscrow',
        user_id: request.user.id,
        caller: partyCaller(caller),
        ...(signer_address !== undefined ? { signer_address } : {}),
        payload: { escrow_id: escrow.id },
      })
      return { unsigned }
    },
  )
}

export default route
