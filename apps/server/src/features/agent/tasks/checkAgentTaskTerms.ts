/**
 * The first half of the agent one-shot, with nothing written: who may post, and
 * whether the escrow terms are valid. Lifted out of `createAgentTask` so that
 * function and the validate-only route (POST /v1/agent/tasks/validate) run ONE
 * copy of these checks and cannot drift — a body the validator accepts must be
 * a body the one-shot gets past its own validation with.
 *
 * Reads one row (the account) and touches nothing else.
 */
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { ErrorCode, type AgentTaskBody } from '@tenda/shared'
import { users } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { validateCreateEscrow, type ValidatedCreateEscrow } from '@server/features/escrows/creation/validateCreateEscrow'

export async function checkAgentTaskTerms(
  fastify: FastifyInstance,
  args: { user_id: string; body: Partial<AgentTaskBody>; now: Date },
): Promise<{ account: { is_agent: boolean; is_seeker: boolean }; input: ValidatedCreateEscrow }> {
  const { user_id, body, now } = args
  const [account] = await fastify.db
    .select({ is_agent: users.is_agent, is_seeker: users.is_seeker })
    .from(users)
    .where(eq(users.id, user_id))
    .limit(1)
  if (account === undefined) throw new AppError(401, ErrorCode.UNAUTHORIZED, 'user no longer exists')
  // The one-shot is the AGENT surface: a human posts through the app, where
  // every step is a screen. Keeping it agent-only is what keeps the badge
  // honest — a task posted here is by an account every surface labels.
  if (!account.is_agent) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'POST /v1/agent/tasks is for agent accounts (POST /v1/agent/register)')
  }
  if (body.creation_operation_id === undefined) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'creation_operation_id is required (it is what the 402 → resend round trip lands on)')
  }
  // An EIP-2612 permit only sets an ERC-20 allowance. The one-shot never
  // needs one: the funds move by the EIP-3009 authorization the agent sends
  // in X-PAYMENT. Refused rather than ignored, because the human create body
  // this one mirrors DOES take a permit — dropping it silently would leave an
  // agent that copied that shape with a signature spent on nothing.
  if ('permit' in body) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'permit is not part of the one-shot: the task is funded by the EIP-3009 authorization sent in X-PAYMENT (no allowance is set, so a permit has nothing to do) — remove it',
    )
  }
  // Escrow terms: the same validator POST /v1/escrows runs, with kind fixed.
  const input = validateCreateEscrow(
    { hasChain: (chain_id) => fastify.chains.has(chain_id), now: () => now, caller_user_id: user_id },
    { ...body, kind: 'gig' },
  )
  return { account, input }
}
