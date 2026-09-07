/**
 * POST /v1/escrows/:id/dispute, either party raises a dispute.
 *
 * Body: { bond_raw, reason }, dispute bond paid by the raiser; refunded
 * on win, forfeited on loss. Amount validated against platform_config at
 * the contract layer; server passes through.
 *
 * The disputes triage row (reason + raiser) is upserted HERE at request
 * time, the on-chain DisputeRaised event only flips escrow.status, and
 * recordDisputeResolution later stamps the winner onto this row. Re-raising
 * after a failed broadcast refreshes the reason instead of erroring
 * (disputes.escrow_id is UNIQUE).
 *
 * State machine: accepted | submitted → disputed.
 */

import type { FastifyPluginAsync } from 'fastify'
import { disputes } from '@tenda/shared/db/schema'
import { AppError, requireBody } from '@server/lib/errors'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { ErrorCode, EXCHANGE_DISPUTE_REASON_MIN_LENGTH, EXCHANGE_DISPUTE_REASON_MAX_LENGTH } from '@tenda/shared'
import { getPlatformConfig } from '@server/lib/platform'
import { guardTransition } from '@server/lib/escrow-routes'
import { assertCallerWallet, buildEscrowTx, partyCaller, readSignerPreference } from '@server/lib/escrow'
import { validateWirePermit } from '@server/chains/evm/permit'
import { isAmountRaw } from '@server/chains/types'

interface Body {
  bond_raw: string
  reason: string
  /** EIP-2612 signature covering the ERC-20 bond (EVM only). */
  permit?: unknown
  /** The wallet the client intends to sign with — a bound mismatch is
   *  refused with the required address named, so the client can switch and
   *  retry (rebuilding its permit for the right owner) instead of
   *  broadcasting a tx that reverts. The triage upsert tolerates the retry. */
  signer_address?: string
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: Body }>(
    '/',
    { preHandler: [fastify.authenticate, requireGoodStanding('dispute')] },
    async (request) => {
      const { bond_raw, reason } = requireBody(request.body)
      if (!isAmountRaw(bond_raw)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'bond_raw required (canonical decimal integer string)',
        )
      }
      const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
      if (
        trimmedReason.length < EXCHANGE_DISPUTE_REASON_MIN_LENGTH ||
        trimmedReason.length > EXCHANGE_DISPUTE_REASON_MAX_LENGTH
      ) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `reason must be ${EXCHANGE_DISPUTE_REASON_MIN_LENGTH}–${EXCHANGE_DISPUTE_REASON_MAX_LENGTH} characters`,
        )
      }
      // Pure field validation BEFORE any write, an invalid permit must not
      // leave a triage row behind. (Namespace check stays below: it needs
      // the escrow's chain.)
      const permit =
        request.body?.permit !== undefined && request.body.permit !== null
          ? validateWirePermit({
              raw: request.body.permit,
              transfer_amount_raw: bond_raw,
              now: new Date(),
            })
          : null

      const cfg = await getPlatformConfig(fastify.db)
      const { escrow, caller } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'dispute',
      })

      const adapter = fastify.chains.get(escrow.chain_id)
      if (permit !== null && adapter.namespace !== 'eip155') {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `permit is not supported on ${escrow.chain_id}`,
        )
      }
      // Declared signer, if any: must be the caller's own wallet. The adapter
      // then refuses a mismatch with the CHAIN-BOUND raiser address by name,
      // which is what lets the client re-target and rebuild the permit with
      // the right owner before anything signs.
      const signer_address = readSignerPreference(request.body)
      if (signer_address !== undefined) {
        await assertCallerWallet(fastify.db, {
          user_id: request.user.id,
          chain_ns: adapter.namespace,
          address: signer_address,
        })
      }

      // Triage row for the admin queue. Upsert: a retry after a failed
      // broadcast refreshes the reason rather than 409ing.
      await fastify.db
        .insert(disputes)
        .values({ escrow_id: escrow.id, raised_by: request.user.id, reason: trimmedReason })
        .onConflictDoUpdate({
          target: disputes.escrow_id,
          set: { raised_by: request.user.id, reason: trimmedReason },
        })
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'disputeEscrow',
        user_id: request.user.id,
        caller: partyCaller(caller),
        ...(signer_address !== undefined ? { signer_address } : {}),
        payload: { escrow_id: escrow.id, bond_raw, ...(permit !== null ? { permit } : {}) },
      })
      return { unsigned }
    },
  )
}

export default route
