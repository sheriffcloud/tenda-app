/**
 * POST /v1/escrows/:id/build-create, rebuild the unsigned createEscrow tx
 * for an OWNED DRAFT, giving server-opened drafts a publish path (CO4
 * residual: fiat-offramp sell offers are inserted without an unsigned tx)
 * and signing-declined drafts a retry that keeps their id.
 *
 * Drafts are pre-publish staging rows, so a lapsed/missing accept deadline
 * is refreshed (shared default window) rather than rejected, nothing the
 * counterparty saw has changed. The buyer-visible terms (asset, amount,
 * rate) are never touched here.
 */

import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { DEFAULT_ACCEPT_WINDOW_SECONDS, ErrorCode } from '@tenda/shared'
import { escrows, exchange_details } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { loadEscrowOr404 } from '@server/lib/escrow-routes'
import { assertNotTakenDown } from '@server/lib/escrow'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { assertCanTransact, assertAssigneeHasWallet } from '@server/lib/auth/resolver'
import { normalizeContractAddress } from '@server/chains/contracts'
import { hasPendingEscrowCreateTransaction } from '@server/features/escrows/creation/hasPendingEscrowCreateTransaction'

/** Deadlines closer than this get refreshed, the program rejects a create
 *  whose accept window is already (about to be) over. */
const REFRESH_MARGIN_MS = 60_000

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/',
    // Publishing IS creating a live listing, same gates as POST /v1/escrows.
    { preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('create')] },
    async (request) => {
      const escrow = await loadEscrowOr404(fastify.db, request.params.id)
      if (escrow.creator_id !== request.user.id) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the creator can publish a draft')
      }
      if (escrow.status !== 'draft') {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'Only drafts can be published, this escrow already left the draft state',
        )
      }
      // Publishing IS an entry action — it funds the listing — and this route
      // does not go through `guardTransition`, so the takedown gate is applied
      // by hand. A hidden draft that published would lock the creator's money
      // into an escrow nobody is allowed to accept; deleting it still works.
      assertNotTakenDown(escrow, 'create')

      // A signed-and-broadcast create may still be verifying, building a
      // second create tx now would just fail on-chain (the PDA exists) and
      // confuse the client. Same guard as DELETE /v1/escrows/:id.
      if (await hasPendingEscrowCreateTransaction(fastify.db, escrow.id)) {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'A create transaction is awaiting confirmation, wait for it to settle',
        )
      }

      // Completion window: gigs always carry it (the create flow demands
      // it); server-opened exchange drafts may predate the stamped insert,
      // fall back to the offer's fiat payment window.
      let completion_duration_seconds = escrow.completion_duration_seconds
      if (completion_duration_seconds === null && escrow.kind === 'exchange') {
        const [details] = await fastify.db
          .select({ payment_window_seconds: exchange_details.payment_window_seconds })
          .from(exchange_details)
          .where(eq(exchange_details.escrow_id, escrow.id))
          .limit(1)
        completion_duration_seconds = details?.payment_window_seconds ?? null
      }
      if (completion_duration_seconds === null) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          'Draft has no completion window, delete it and create the listing again',
        )
      }

      // Refresh a lapsed/missing accept deadline (pre-publish: the listing
      // window is ours to restart, the offer terms are untouched).
      const now = Date.now()
      let accept_deadline = escrow.accept_deadline
      if (accept_deadline === null || accept_deadline.getTime() <= now + REFRESH_MARGIN_MS) {
        accept_deadline = new Date(now + DEFAULT_ACCEPT_WINDOW_SECONDS * 1000)
      }

      // The chain may have been deconfigured since the draft was created
      // (e.g. BASE env removed), surface a clean 503, not a raw throw.
      if (!fastify.chains.has(escrow.chain_id)) {
        throw new AppError(
          503,
          ErrorCode.SERVICE_UNAVAILABLE,
          `chain '${escrow.chain_id}' is not currently available`,
        )
      }
      const adapter = fastify.chains.get(escrow.chain_id)
      // Publishing IS creating, same first-transaction gate as POST /v1/escrows
      // (covers server-opened fiat-offramp drafts that never hit create's gate).
      // Runs BEFORE the deadline write so a rejected publish mutates nothing.
      await assertCanTransact(fastify.db, request.user.id, adapter.namespace)
      // A direct-assigned draft bakes the assignee's wallet into the create tx.
      if (escrow.assigned_counterparty_id !== null) {
        await assertAssigneeHasWallet(fastify.db, escrow.assigned_counterparty_id, adapter.namespace)
      }

      // Persist what the unsigned tx will encode, so the DB row and the
      // on-chain account can never disagree after confirmation.
      //
      // The contract is RE-stamped, not preserved. A draft holds no funds, so
      // there is nothing to strand: it publishes into whichever contract is
      // current at the moment it is actually created. Preserving an older stamp
      // here would be the real bug — the draft would encode a create for a
      // contract it is no longer being built against, and the pending-create
      // guard above is what stops this racing a create already in flight.
      const escrow_contract = normalizeContractAddress(adapter.namespace, adapter.escrowAddress)
      if (
        accept_deadline !== escrow.accept_deadline ||
        completion_duration_seconds !== escrow.completion_duration_seconds ||
        escrow_contract !== escrow.escrow_contract
      ) {
        await fastify.db
          .update(escrows)
          .set({ accept_deadline, completion_duration_seconds, escrow_contract })
          .where(and(eq(escrows.id, escrow.id), eq(escrows.status, 'draft')))
      }

      const unsigned = await adapter.buildTx({
        action: 'createEscrow',
        user_id: request.user.id,
        payload: {
          escrow_id: escrow.id,
          kind: escrow.kind,
          asset: escrow.asset,
          amount_raw: escrow.amount_raw,
          ...(escrow.assigned_counterparty_id !== null
            ? { assigned_counterparty_user_id: escrow.assigned_counterparty_id }
            : {}),
          accept_deadline_unix: Math.floor(accept_deadline.getTime() / 1000),
          completion_duration_seconds,
          dispute_bond_raw: escrow.dispute_bond_raw,
          // Acceptance mode. Both come from the DRAFT ROW, not from config:
          // this route rebuilds the transaction for an escrow that already
          // exists, so it must encode what that draft was created with.
          // Reading config here would silently re-mode a draft whose defaults
          // had since changed.
          requires_approval: escrow.requires_approval,
          unassign_window_seconds: escrow.unassign_window_seconds,
          is_seeker: escrow.is_seeker,
        },
      })

      return { escrow_id: escrow.id, unsigned }
    },
  )
}

export default route
