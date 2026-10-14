/**
 * POST /v1/agent/tasks/validate: everything the one-shot checks BEFORE it
 * mints a draft, and nothing it does after. No draft row, no listing row, no
 * moderation verdict, no chain call, no payment.
 *
 * It is the one-shot's own first two checks, called, not copied:
 * `checkAgentTaskTerms` (who may post + `validateCreateEscrow`) and
 * `validateListing` (the creator's country + `validateGigDetails`). The
 * language-model moderation gate is NOT run — it costs up to six seconds and a
 * model call, and its verdict is recorded against a draft that does not exist
 * here — so the answer says `moderation: 'not_run'` and a client must not read
 * "ok" as "cleared".
 *
 * Refusals are the ones the one-shot throws, first one first: the validators
 * stop at the first bad field, so this reports one, not a list.
 */
import type { FastifyInstance } from 'fastify'
import type { AgentTaskBody, AgentTaskValidated } from '@tenda/shared'
import { validateListing } from '@server/features/gigs/attachGigDetails'
import { checkAgentTaskTerms } from './checkAgentTaskTerms'

export async function validateAgentTask(
  fastify: FastifyInstance,
  args: { user_id: string; body: Partial<AgentTaskBody> },
): Promise<AgentTaskValidated> {
  const { user_id, body } = args
  await checkAgentTaskTerms(fastify, { user_id, body, now: new Date() })
  await validateListing(fastify, { user_id, body })
  return { ok: true, moderation: 'not_run' }
}
