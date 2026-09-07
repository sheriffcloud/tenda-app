/**
 * requireGoodStanding(op), Fastify preHandler gating create / accept /
 * dispute behind the active restriction (stage-7-reputation.md § server).
 * Expired restrictions pass transparently; manual_review blocks everything.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import {
  checkOperationAllowed,
  type GuardedOperation,
} from '@server/features/reputation/service'
import { drizzleReputationStore } from '@server/features/reputation/store'

export function requireGoodStanding(op: GuardedOperation) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const check = await checkOperationAllowed(
      { store: drizzleReputationStore(request.server.db), now: () => new Date() },
      request.user.id,
      op,
    )
    if (check.allowed) return

    const code =
      check.kind === 'manual_review' ? ErrorCode.ACCOUNT_UNDER_REVIEW : ErrorCode.USER_RESTRICTED
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: check.reason,
      code,
      details: {
        kind: check.kind,
        ...(check.until !== null ? { until: check.until.toISOString() } : {}),
      },
    })
  }
}
