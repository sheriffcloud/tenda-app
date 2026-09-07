/**
 * POST /v1/escrows/:id/resolve, dispute_admin decides outcome.
 *
 * Body: { winner: 'creator' | 'counterparty' | 'split' }.
 *
 * Authorization: caller must hold the v2 `dispute_admin` role (single key
 * at launch per decision #17; Stage 5 migrates to 2-of-3 multisig with no
 * contract change). State machine: disputed → resolved.
 */

import type { FastifyPluginAsync } from 'fastify'
import { AppError } from '@server/lib/errors'
import { ErrorCode, type ResolutionWinner } from '@tenda/shared'
import { getPlatformConfig } from '@server/lib/platform'
import { guardTransition } from '@server/lib/escrow-routes'
import { buildResolveTx } from '@server/lib/escrow/resolve-tx'

interface Body { winner: ResolutionWinner }

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: Body }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const winner = narrowWinner(request.body?.winner)
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'resolve',
      })
      const unsigned = await buildResolveTx(
        { db: fastify.db, chains: fastify.chains, contracts: fastify.contracts },
        { escrow, winner, signer_user_id: request.user.id },
      )
      return { unsigned }
    },
  )
}

function narrowWinner(v: unknown): ResolutionWinner {
  // Switch-narrowing without a cast, matches the project rule.
  if (v === 'creator' || v === 'counterparty' || v === 'split') return v
  throw new AppError(
    400,
    ErrorCode.VALIDATION_ERROR,
    `winner must be one of: creator | counterparty | split`,
  )
}

export default route
