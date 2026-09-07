/**
 * The agent one-shot (#19): one call carries the escrow terms AND the
 * listing; the server mints the draft, attaches and moderates the listing,
 * and answers 402 with the x402 terms bound to that draft — or, when the
 * call carries `X-PAYMENT`, relays the artifact and answers the created task.
 *
 * Nothing here is new machinery. It composes the pieces the human flow runs
 * as separate requests — draft resolution (POST /v1/escrows), the listing
 * satellite (POST /v1/gigs), relayed funding (POST /v1/escrows/:id/fund) —
 * so the guards, the moderation gate and the replay rules are the same code,
 * not a second copy of them. `creation_operation_id` is REQUIRED: the 402 →
 * resend round trip has to land on the same draft, and the operation key is
 * what makes it (and what makes a retried resend harmless).
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { ErrorCode, type AgentTaskBody, type RelayPaymentPayload } from '@tenda/shared'
import { users } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { getPlatformConfig } from '@server/lib/platform'
import { assertCanTransact, resolveAssigneeWalletAddress } from '@server/lib/auth/resolver'
import { assertCallerWallet, readSignerPreference } from '@server/lib/escrow'
import { normalizeContractAddress } from '@server/chains/contracts'
import { validateCreateEscrow } from '@server/features/escrows/creation/validateCreateEscrow'
import { findReplayedDraft, insertDraft } from '@server/features/escrows/creation/draftResolution'
import { attachGigDetails } from '@server/features/gigs/attachGigDetails'
import { relayDraftFunding, type RelayDraftOutcome } from '@server/features/escrows/funding/relayDraftFunding'

export type AgentTaskOutcome = RelayDraftOutcome & { task_id: string }

export async function createAgentTask(
  fastify: FastifyInstance,
  args: {
    user_id: string
    body: Partial<AgentTaskBody>
    payment: RelayPaymentPayload | undefined
    log: FastifyBaseLogger
  },
): Promise<AgentTaskOutcome> {
  const { user_id, body } = args
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
  // ONE instant, shared with the draft's provisional accept deadline (#41).
  const now = new Date()
  const input = validateCreateEscrow(
    { hasChain: (chain_id) => fastify.chains.has(chain_id), now: () => now, caller_user_id: user_id },
    { ...body, kind: 'gig' },
  )
  const adapter = fastify.chains.get(input.chain_id)
  // Gates BEFORE any draft write, so a refused call leaves nothing behind.
  await assertCanTransact(fastify.db, user_id, adapter.namespace)
  const signer_address = readSignerPreference(body)
  if (signer_address !== undefined) {
    await assertCallerWallet(fastify.db, { user_id, chain_ns: adapter.namespace, address: signer_address })
  }
  const assigned_counterparty_address =
    input.assigned_counterparty_id === null
      ? null
      : await resolveAssigneeWalletAddress(fastify.db, input.assigned_counterparty_id, adapter.namespace)
  const { permit: _permit, ...terms } = input
  const identity = { user_id, terms, assigned_counterparty_address }

  // Find the draft this operation already minted (the resend), or insert it.
  let escrow = await findReplayedDraft(fastify.db, identity)
  if (escrow === null) {
    const { unassign_window_seconds } = await getPlatformConfig(fastify.db)
    escrow = (
      await insertDraft(fastify.db, {
        ...identity,
        now,
        escrow_id: randomUUID(),
        is_seeker: account.is_seeker,
        unassign_window_seconds,
        escrow_contract: normalizeContractAddress(adapter.namespace, adapter.escrowAddress),
      })
    ).row
  }

  // The listing, moderated, on every call: the resend re-attaches the same
  // fields (an upsert), and changed fields are re-moderated exactly as a
  // human's retry through POST /v1/gigs would be.
  await attachGigDetails(fastify, { escrow, user_id, body })

  const outcome = await relayDraftFunding(fastify, { escrow, user_id, body, payment: args.payment, log: args.log })
  return { ...outcome, task_id: escrow.id }
}
