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
import { and, eq, sql } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { escrows } from '@tenda/shared/db/schema'
import { users } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { getPlatformConfig } from '@server/lib/platform'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { requireProfileComplete } from '@server/lib/guards'
import { assertCanTransact, assertAssigneeHasWallet } from '@server/lib/auth/resolver'
import { validateCreateEscrow, type CreateEscrowBody } from '@server/features/escrows/creation/validateCreateEscrow'
import { normalizeContractAddress } from '@server/chains/contracts'
import { assertNotTakenDown } from '@server/lib/escrow'
import { hasPendingEscrowCreateTransaction } from '@server/features/escrows/creation/hasPendingEscrowCreateTransaction'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateEscrowBody }>(
    '/',
    { preHandler: [fastify.authenticate, requireProfileComplete, requireGoodStanding('create')] },
    async (request, reply) => {
      const input = validateCreateEscrow(
        {
          hasChain: (chain_id) => fastify.chains.has(chain_id),
          now: () => new Date(),
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

      const escrow_id = randomUUID()
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
      // Direct assignment bakes the assignee's wallet into the escrow at create,
      // so they must already have one (clean 422 vs the adapter's raw 404).
      if (input.assigned_counterparty_id !== null) {
        await assertAssigneeHasWallet(fastify.db, input.assigned_counterparty_id, adapter.namespace)
      }
      const { unassign_window_seconds } = await getPlatformConfig(fastify.db)
      const matchesInput = (row: typeof escrows.$inferSelect): boolean =>
        row.kind === input.kind &&
        row.chain_id === input.chain_id &&
        row.asset === input.asset &&
        row.amount_raw === input.amount_raw &&
        row.assigned_counterparty_id === input.assigned_counterparty_id &&
        row.requires_approval === input.requires_approval &&
        row.completion_duration_seconds === input.completion_duration_seconds &&
        row.dispute_bond_raw === input.dispute_bond_raw &&
        row.accept_deadline?.getTime() === input.accept_deadline_unix * 1000
      const buildUnsigned = (escrowId: string, persisted?: typeof escrows.$inferSelect) => adapter.buildTx({
        action: 'createEscrow',
        user_id: request.user.id,
        payload: {
          escrow_id: escrowId,
          kind: persisted?.kind ?? input.kind,
          asset: persisted?.asset ?? input.asset,
          amount_raw: persisted?.amount_raw ?? input.amount_raw,
          ...((persisted?.assigned_counterparty_id ?? input.assigned_counterparty_id) !== null
            ? { assigned_counterparty_user_id: persisted?.assigned_counterparty_id ?? input.assigned_counterparty_id! }
            : {}),
          accept_deadline_unix: persisted === undefined
            ? input.accept_deadline_unix
            : Math.floor(persisted.accept_deadline!.getTime() / 1000),
          completion_duration_seconds: persisted?.completion_duration_seconds ?? input.completion_duration_seconds,
          dispute_bond_raw: persisted?.dispute_bond_raw ?? input.dispute_bond_raw,
          is_seeker: persisted?.is_seeker ?? user.is_seeker,
          requires_approval: persisted?.requires_approval ?? input.requires_approval,
          // Fixed on-chain at create and immutable after, so the row must
          // record the SAME number the transaction encodes — see the escrows
          // column comment for why today's config is not a substitute.
          unassign_window_seconds: persisted?.unassign_window_seconds ?? unassign_window_seconds,
          ...(input.permit !== null ? { permit: input.permit } : {}),
        },
      })

      const assertReplayable = async (row: typeof escrows.$inferSelect): Promise<void> => {
        if (row.status !== 'draft') {
          throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, 'This creation operation is no longer a draft')
        }
        assertNotTakenDown(row, 'create')
        if (await hasPendingEscrowCreateTransaction(fastify.db, row.id)) {
          throw new AppError(
            409,
            ErrorCode.ESCROW_WRONG_STATUS,
            'A create transaction is awaiting confirmation, wait for it to settle',
          )
        }
      }

      const matchingOperation = input.creation_operation_id === null
        ? undefined
        : await fastify.db.query.escrows.findFirst({
            where: and(
              eq(escrows.creator_id, request.user.id),
              eq(escrows.creation_operation_id, input.creation_operation_id),
            ),
          })
      if (matchingOperation !== undefined) {
        if (!matchesInput(matchingOperation)) {
          throw new AppError(
            409,
            ErrorCode.VALIDATION_ERROR,
            'creation_operation_id was already used with different escrow terms',
          )
        }
        await assertReplayable(matchingOperation)
        return reply.code(200).send({
          escrow_id: matchingOperation.id,
          unsigned: await buildUnsigned(matchingOperation.id, matchingOperation),
        })
      }

      const unsigned = await buildUnsigned(escrow_id)

      const insertValues = {
        id: escrow_id,
        creation_operation_id: input.creation_operation_id,
        kind: input.kind,
        chain_id: input.chain_id,
        asset: input.asset,
        amount_raw: input.amount_raw,
        creator_id: request.user.id,
        assigned_counterparty_id: input.assigned_counterparty_id,
        requires_approval: input.requires_approval,
        unassign_window_seconds,
        status: 'draft',
        // The contract this create targets. A new escrow always joins the
        // CURRENT deployment, so `adapter.escrowAddress` is right by definition
        // — but it must be recorded, because by the time a transition is built
        // "current" may mean a different contract and the funds will not have
        // moved with it. Re-attested from the EscrowCreated log when the tx
        // lands (lib/escrow-events), which is what makes a create built just
        // before a redeploy and mined just after still record the truth.
        escrow_contract: normalizeContractAddress(adapter.namespace, adapter.escrowAddress),
        accept_deadline: new Date(input.accept_deadline_unix * 1000),
        completion_duration_seconds: input.completion_duration_seconds,
        dispute_bond_raw: input.dispute_bond_raw,
        is_seeker: user.is_seeker,
      } satisfies typeof escrows.$inferInsert
      const inserted = input.creation_operation_id === null
        ? await fastify.db.insert(escrows).values(insertValues).returning({ id: escrows.id })
        : await fastify.db.insert(escrows).values(insertValues).onConflictDoNothing({
            target: [escrows.creator_id, escrows.creation_operation_id],
            where: sql`${escrows.creation_operation_id} IS NOT NULL`,
          }).returning({ id: escrows.id })

      if (inserted.length === 0 && input.creation_operation_id !== null) {
        // A concurrent identical request won the unique operation key after
        // our build. Re-enter once; it now follows the verified existing path.
        const winner = await fastify.db.query.escrows.findFirst({
          where: and(
            eq(escrows.creator_id, request.user.id),
            eq(escrows.creation_operation_id, input.creation_operation_id),
          ),
        })
        if (winner === undefined) {
          throw new AppError(409, ErrorCode.INTERNAL_ERROR, 'Could not reconcile escrow creation')
        }
        if (!matchesInput(winner)) {
          throw new AppError(
            409,
            ErrorCode.VALIDATION_ERROR,
            'creation_operation_id was already used with different escrow terms',
          )
        }
        await assertReplayable(winner)
        return reply.code(200).send({
          escrow_id: winner.id,
          unsigned: await buildUnsigned(winner.id, winner),
        })
      }

      return reply.code(201).send({ escrow_id, unsigned })
    },
  )
}

export default route
