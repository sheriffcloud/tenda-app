/**
 * POST /v1/escrows/:id/build-create, rebuild the unsigned createEscrow tx
 * for an OWNED DRAFT, giving server-opened drafts a publish path (CO4
 * residual: fiat-offramp sell offers are inserted without an unsigned tx)
 * and signing-declined drafts a retry that keeps their id.
 *
 * Drafts are pre-publish staging rows, so a lapsed/missing accept deadline
 * is refreshed (shared default window) rather than rejected, nothing the
 * counterparty saw has changed. The buyer-visible terms (asset, amount,
 * rate) are never touched here. The preamble — every guard and the row
 * re-stamp — is `prepareDraftCreate`, shared with the relayed-funding route.
 */

import type { FastifyPluginAsync } from 'fastify'
import type { SignerPreferenceBody } from '@tenda/shared'
import { loadEscrowOr404 } from '@server/lib/escrow-routes'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { prepareDraftCreate } from '@server/features/escrows/creation/prepareDraftCreate'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: SignerPreferenceBody | null }>(
    '/',
    // Publishing IS creating a live listing, same gates as POST /v1/escrows.
    { preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('create')] },
    async (request) => {
      const escrow = await loadEscrowOr404(fastify.db, request.params.id)
      const { adapter, payload, signer_address } = await prepareDraftCreate(fastify, {
        escrow,
        user_id: request.user.id,
        body: request.body,
      })
      const unsigned = await adapter.buildTx({
        action: 'createEscrow',
        user_id: request.user.id,
        ...(signer_address !== undefined ? { signer_address } : {}),
        payload,
      })
      return { escrow_id: escrow.id, unsigned }
    },
  )
}

export default route
