/**
 * POST /v1/blockchain/permit-payload, server-built EIP-712 typed data for an
 * EIP-2612 permit. The client signs it verbatim (eth_signTypedData_v4) and
 * passes the signature back in the create/dispute `permit` body, it never
 * constructs or hashes domains itself.
 *
 * The adapter reads the token's live facts (name, owner nonce,
 * DOMAIN_SEPARATOR) over the server's RPC, takes the domain version from the
 * manifest, and verifies the reconstructed domain against the on-chain
 * separator before returning, a mismatch (token rename/upgrade) degrades to
 * PERMIT_UNAVAILABLE so the client falls back to the approve flow.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

interface PermitPayloadWireBody {
  chain_id?: unknown
  asset?: unknown
  value_raw?: unknown
  owner?: unknown
}

const permitPayload: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: PermitPayloadWireBody }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      // Each build is 3 live RPC reads on the keyed endpoint, cap per user.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      const body = request.body ?? {}
      if (typeof body.chain_id !== 'string' || body.chain_id === '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'chain_id is required')
      }
      if (!fastify.chains.has(body.chain_id)) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `unsupported chain_id '${body.chain_id}'`,
        )
      }
      if (typeof body.asset !== 'string' || body.asset === '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'asset is required')
      }
      if (typeof body.value_raw !== 'string' || body.value_raw === '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'value_raw is required')
      }
      if (typeof body.owner !== 'string' || body.owner === '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'owner is required')
      }

      const adapter = fastify.chains.get(body.chain_id)
      if (adapter.buildPermitPayload === undefined) {
        // Non-EVM namespaces have no token-permit semantics, typed so the
        // client branches to the approve flow, not an error screen.
        throw new AppError(
          422,
          ErrorCode.PERMIT_UNAVAILABLE,
          `chain '${body.chain_id}' has no permit support, use the approve flow`,
        )
      }
      return adapter.buildPermitPayload({
        user_id: request.user.id,
        owner: body.owner,
        asset: body.asset,
        value_raw: body.value_raw,
      })
    },
  )
}

export default permitPayload
