/**
 * POST /v1/escrows/:id/fund — relayed funding of an OWNED DRAFT (x402, #18).
 *
 * NOT the agent's endpoint. This is the escrow PRIMITIVE — "fund this draft by
 * signature, the relayer pays gas" — kept beside the other /v1/escrows/:id/*
 * actions so any keyed client could use it (a gasless web/mobile user, one
 * day). Today nothing calls it: web and mobile do not, and agents get the
 * one-shot POST /v1/agent/tasks (#19), which runs the same
 * `relayDraftFunding` step in-process rather than hopping through here.
 * Kept by decision (2026-08-28); see docs/agent_escrow_funding_relayer.md.
 *
 * Without an `X-PAYMENT` header the answer is 402 with the terms: exactly
 * what the creator must sign (an EIP-3009 authorization on EVM, the create
 * transaction itself on Solana) and by when. With one, the adapter verifies
 * the artifact against the terms the draft yields NOW, simulates, and
 * broadcasts with the relayer paying gas; the attempt is recorded like a
 * client-ping so the ordinary verify pipeline confirms it.
 *
 * The same preamble as build-create (`prepareDraftCreate`), so a draft that
 * cannot be published by the creator's own signature cannot be relayed
 * either. The 402 body is the x402 envelope, not the ApiError one — an
 * x402 client reads the terms where the protocol says they are.
 */
import type { FastifyPluginAsync } from 'fastify'
import {
  RELAY_PAYMENT_REQUIRED_MESSAGE,
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  type FundEscrowResponse,
  type RelayPaymentRequired,
  type SignerPreferenceBody,
} from '@tenda/shared'
import { loadEscrowOr404 } from '@server/lib/escrow-routes'
import { decodePaymentHeader, encodeSettlementHeader } from '@server/lib/x402'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { relayDraftFunding } from '@server/features/escrows/funding/relayDraftFunding'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: SignerPreferenceBody | null }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('create')],
      // Every call is live RPC reads plus, with a header, a simulation and a
      // broadcast the relayer pays for — bounded per IP, the app's rate-limit key.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      // Parsed FIRST: a malformed header is a 400 before any work, and the
      // parse cannot depend on the draft.
      const payment = decodePaymentHeader(request.headers[X_PAYMENT_HEADER])
      const escrow = await loadEscrowOr404(fastify.db, request.params.id)
      const outcome = await relayDraftFunding(fastify, {
        escrow,
        user_id: request.user.id,
        body: request.body,
        payment,
        log: request.log,
      })
      if (outcome.kind === 'payment_required') {
        const body: RelayPaymentRequired = {
          x402Version: X402_VERSION,
          accepts: [outcome.terms],
          error: RELAY_PAYMENT_REQUIRED_MESSAGE,
        }
        return reply.code(402).send(body)
      }
      const body: FundEscrowResponse = {
        status: 'queued',
        tx_ref: outcome.tx_ref,
        recorded: outcome.recorded,
        enqueued: outcome.enqueued,
      }
      return reply
        .code(202)
        .header(X_PAYMENT_RESPONSE_HEADER, encodeSettlementHeader(outcome.settlement))
        .send(body)
    },
  )
}

export default route
