/**
 * POST /v1/escrows, the create entry for the escrow primitive.
 *
 * Flow: validate (lib/escrow-create.ts) → generate the id server-side →
 * build the unsigned createEscrow tx (the DB id is the on-chain PDA seed)
 * → insert the draft row. Tx is built BEFORE the insert so a builder
 * failure never strands an orphan draft; the insert is the last step and
 * the unsigned tx is only returned when the row exists.
 *
 * Domain satellites (gig_details / exchange_details) are attached by the
 * kind-specific create routes (cutover §3, "gigs/: listings +
 * create-detail only"); this route owns the chain-agnostic core.
 *
 * is_seeker comes from the DB user row, never the request body, it
 * selects the fee tier and must not be client-claimed.
 */

import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { users } from '@tenda/shared/db/schema/identity'
import { escrows } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { getPlatformConfig } from '@server/lib/platform'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { assertCanTransact, resolveAssigneeWalletAddress } from '@server/lib/auth/resolver'
import { validateCreateEscrow, type CreateEscrowBody } from '@server/features/escrows/creation/validateCreateEscrow'
import { normalizeContractAddress } from '@server/chains/contracts'
import { assertCallerWallet, readSignerPreference } from '@server/lib/escrow'
import { draftCreatePayload, type DraftSource } from '@server/features/escrows/creation/draftCreatePayload'
import { draftColumns, findReplayedDraft, insertDraft } from '@server/features/escrows/creation/draftResolution'
import { acceptDeadlineMoved, deriveAcceptDeadline } from '@server/features/escrows/creation/deriveAcceptDeadline'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateEscrowBody }>(
    '/',
    { preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('create')] },
    async (request, reply) => {
      // ONE instant for the whole request: the validator and the draft's
      // provisional accept deadline are both anchored to it, so they cannot
      // disagree by the milliseconds between two `new Date()` calls (#41).
      const now = new Date()
      const input = validateCreateEscrow(
        {
          hasChain: (chain_id) => fastify.chains.has(chain_id),
          now: () => now,
          caller_user_id: request.user.id,
        },
        request.body ?? {},
      )

      const userRows = await fastify.db
        .select({ is_seeker: users.is_seeker })
        .from(users)
        .where(eq(users.id, request.user.id))
        .limit(1)
      const user = userRows[0]
      if (user === undefined) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'user no longer exists')
      }

      const adapter = fastify.chains.get(input.chain_id)
      // EIP-2612 is an EVM-token concept, never forward a permit to an
      // adapter whose namespace can't encode it.
      if (input.permit !== null && adapter.namespace !== 'eip155') {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          `permit is not supported on ${input.chain_id}`,
        )
      }
      // First-transaction gate: a wallet on this chain + a verified contact.
      await assertCanTransact(fastify.db, request.user.id, adapter.namespace)
      // Free-signer case: the wallet the client intends to sign with is baked
      // in (Solana) / enforced on the wire (EVM) — but only a wallet this
      // caller has verified. Absent → the primary, the pre-existing default.
      const signer_address = readSignerPreference(request.body)
      if (signer_address !== undefined) {
        await assertCallerWallet(fastify.db, {
          user_id: request.user.id,
          chain_ns: adapter.namespace,
          address: signer_address,
        })
      }
      // Direct assignment bakes the assignee's wallet into the escrow at create,
      // so they must already have one (clean 422 vs the adapter's raw 404) —
      // and the row RECORDS which wallet will be baked, via the same
      // resolution the builder runs, so the assignee's my_signer_address can
      // name the one wallet their accept/decline must be signed with.
      const assigned_counterparty_address =
        input.assigned_counterparty_id === null
          ? null
          : await resolveAssigneeWalletAddress(fastify.db, input.assigned_counterparty_id, adapter.namespace)
      const { permit, ...terms } = input
      const identity = { user_id: request.user.id, terms, assigned_counterparty_address }

      // The draft a persisted row describes → the adapter's payload, plus the
      // permit riding this request (never persisted; it is a signature).
      const buildUnsigned = (
        draft: DraftSource & { accept_deadline: Date | null; completion_duration_seconds: number | null },
      ) => {
        if (draft.accept_deadline === null || draft.completion_duration_seconds === null) {
          throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'a created draft must carry its windows')
        }
        return adapter.buildTx({
          action: 'createEscrow',
          user_id: request.user.id,
          ...(signer_address !== undefined ? { signer_address } : {}),
          payload: {
            ...draftCreatePayload(draft, {
              accept_deadline: draft.accept_deadline,
              completion_duration_seconds: draft.completion_duration_seconds,
            }),
            ...(permit !== null ? { permit } : {}),
          },
        })
      }

      // A replayed operation (same terms, still a draft) answers the SAME
      // draft with a rebuilt transaction — features/escrows/creation owns
      // the rules, shared with the agent one-shot.
      const replayed = await findReplayedDraft(fastify.db, identity)
      if (replayed !== null) {
        // A replay can arrive after the draft's own window has run out, and this
        // path does not go through `prepareDraftCreate` — so it applies the same
        // derivation, and persists it when it moved. Handing back a transaction
        // the row disagrees with is the failure mode the re-stamp exists to stop;
        // handing back a LAPSED one costs the caller gas for a certain revert.
        const accept_deadline = deriveAcceptDeadline(replayed, now)
        if (acceptDeadlineMoved(replayed.accept_deadline, accept_deadline)) {
          await fastify.db
            .update(escrows)
            .set({ accept_deadline })
            .where(and(eq(escrows.id, replayed.id), eq(escrows.status, 'draft')))
        }
        const unsigned = await buildUnsigned({ ...replayed, accept_deadline })
        return reply.code(200).send({ escrow_id: replayed.id, unsigned })
      }

      const { unassign_window_seconds } = await getPlatformConfig(fastify.db)
      const escrow_id = randomUUID()
      const insert = {
        ...identity,
        escrow_id,
        now,
        is_seeker: user.is_seeker,
        unassign_window_seconds,
        escrow_contract: normalizeContractAddress(adapter.namespace, adapter.escrowAddress),
      }
      // Built BEFORE the insert so a builder failure never strands an orphan
      // draft; the row is the last step and the transaction only returned
      // when it exists. Built from the SAME columns the insert writes.
      const unsigned = await buildUnsigned(draftColumns(insert))
      const { row, created } = await insertDraft(fastify.db, insert)
      // Lost the operation-key race: the winner's row is the draft, and its
      // transaction is rebuilt from that row (the assignee may have been
      // restamped), exactly as the replay path above does.
      return created
        ? reply.code(201).send({ escrow_id, unsigned })
        : reply.code(200).send({ escrow_id: row.id, unsigned: await buildUnsigned(row) })
    },
  )
}

export default route
