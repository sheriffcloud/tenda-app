/**
 * POST /v1/agent/tasks/validate — check a task body without side effects.
 *
 * The same body as POST /v1/agent/tasks. Answers `200 { ok: true,
 * moderation: 'not_run' }` or the first refusal the one-shot would give, in the
 * ApiError envelope. Creates no draft, takes no payment, runs no moderation
 * (see features/agent/tasks/validateAgentTask.ts). Agent accounts only, like
 * the one-shot, with its own limits: it is cheap, so a posting UI or an
 * importer can check many rows before asking for a wallet signature.
 */
import type { FastifyPluginAsync } from 'fastify'
import type { AgentTaskBody, AgentTaskValidated } from '@tenda/shared'
import { requireBody } from '@server/lib/errors'
import { accountRateLimit } from '@server/lib/http/account-rate-limit'
import { AGENT_VALIDATE_ACCOUNT_RATE_LIMIT, AGENT_VALIDATE_IP_RATE_LIMIT } from '@server/lib/http/rate-limits'
import { validateAgentTask } from '@server/features/agent/tasks/validateAgentTask'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Partial<AgentTaskBody> | null; Reply: AgentTaskValidated }>(
    '/',
    {
      preHandler: [fastify.authenticate, accountRateLimit(fastify, AGENT_VALIDATE_ACCOUNT_RATE_LIMIT)],
      config: { rateLimit: AGENT_VALIDATE_IP_RATE_LIMIT },
    },
    async (request) => validateAgentTask(fastify, { user_id: request.user.id, body: requireBody(request.body) }),
  )
}

export default route
