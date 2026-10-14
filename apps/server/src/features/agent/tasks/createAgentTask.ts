/**
 * The agent one-shot (#19): one call carries the escrow terms AND the
 * listing; the server validates and moderates the listing, mints the draft
 * with it attached, and answers 402 with the x402 terms bound to that draft
 * — or, when the call carries `X-PAYMENT`, relays the artifact and answers
 * the created task.
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
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { AgentTaskBody, RelayPaymentPayload } from '@tenda/shared'
import { getConfig } from '@server/config'
import { getPlatformConfig } from '@server/lib/platform'
import { assertCanTransact, resolveAssigneeWalletAddress } from '@server/lib/auth/resolver'
import { assertCallerWallet, readSignerPreference } from '@server/lib/escrow'
import { normalizeContractAddress } from '@server/chains/contracts'
import { checkAgentTaskTerms } from './checkAgentTaskTerms'
import { findReplayedDraft, insertDraft } from '@server/features/escrows/creation/draftResolution'
import { attachGigDetails, prepareGigDetails, upsertGigDetails } from '@server/features/gigs/attachGigDetails'
import { relayDraftFunding, type RelayDraftOutcome } from '@server/features/escrows/funding/relayDraftFunding'
import { evictDraftsBeyond, isDemoAccount } from '../demo/demoDraftRing'

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
  // ONE instant, shared with the draft's provisional accept deadline (#41).
  const now = new Date()
  // Who may post and whether the terms are valid: the same checks, in one
  // place, that POST /v1/agent/tasks/validate runs.
  const { account, input } = await checkAgentTaskTerms(fastify, { user_id, body, now })
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
    // A NEW draft. The listing is validated and moderated FIRST (#155): it is
    // the last gate, and run after the insert it left a draft with no listing
    // behind every refused body — bounded for the demo account by the ring,
    // unbounded for an agent minting fresh operation ids. The verdict is
    // recorded against the id the draft is minted under, so an approve/warn
    // trail links to its row exactly as before; a refused call leaves nothing
    // but its verdict, which is what the admin log is for.
    const escrow_id = randomUUID()
    const listing = await prepareGigDetails(fastify, {
      escrow: { id: escrow_id, asset: terms.asset, amount_raw: terms.amount_raw },
      user_id,
      body,
    })
    // Only then does the shared demo account's ring turn (#147): its oldest
    // unfunded drafts beyond the cap go before this one is minted. A resend
    // lands on the replayed draft above and rings nothing out, and neither
    // does a refused listing. Ordinary agents are untouched.
    const config = getConfig()
    if (await isDemoAccount(fastify.db, user_id, config.AGENT_DEMO_ADDRESS)) {
      const evicted = await evictDraftsBeyond(fastify.db, { user_id, keep: config.AGENT_DEMO_DRAFT_CAP - 1 })
      if (evicted > 0) args.log.info({ user_id, evicted, cap: config.AGENT_DEMO_DRAFT_CAP }, 'demo draft ring: oldest drafts discarded')
    }
    const { unassign_window_seconds } = await getPlatformConfig(fastify.db)
    escrow = (
      await insertDraft(fastify.db, {
        ...identity,
        now,
        escrow_id,
        is_seeker: account.is_seeker,
        unassign_window_seconds,
        escrow_contract: normalizeContractAddress(adapter.namespace, adapter.escrowAddress),
      })
    ).row
    // `escrow.id`, not `escrow_id`: a concurrent identical request may have won
    // the operation key, and the listing then belongs on the winner's draft —
    // the same terms, so the verdict above priced the same amount.
    await upsertGigDetails(fastify.db, escrow.id, listing)
  } else {
    // The resend re-attaches the same fields (an upsert), and changed fields
    // are re-moderated exactly as a human's retry through POST /v1/gigs would be.
    await attachGigDetails(fastify, { escrow, user_id, body })
  }

  const outcome = await relayDraftFunding(fastify, { escrow, user_id, body, payment: args.payment, log: args.log })
  return { ...outcome, task_id: escrow.id }
}
