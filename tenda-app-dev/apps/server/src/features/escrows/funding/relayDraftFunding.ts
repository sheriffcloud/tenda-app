/**
 * The relayed-funding step over a prepared DRAFT (#18): quote the x402 terms,
 * or verify + relay the artifact and record the attempt. ONE implementation
 * behind the escrow primitive (POST /v1/escrows/:id/fund) and the agent
 * one-shot (POST /v1/agent/tasks, #19), which differ only in what they wrap
 * around it and how they shape the answer.
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { ErrorCode, type RelayPaymentPayload, type RelaySettlementResponse, type RelayTerms, type SignerPreferenceBody } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { EscrowRow } from '@server/lib/escrow-routes'
import { resolvePrimaryWalletAddress } from '@server/lib/auth/resolver'
import { drizzleTxAttemptsStore, recordTxAttempt } from '@server/lib/tx-attempts'
import { prepareDraftCreate } from '@server/features/escrows/creation/prepareDraftCreate'

export type RelayDraftOutcome =
  /** No X-PAYMENT: the terms the creator must sign. */
  | { kind: 'payment_required'; terms: RelayTerms }
  /** The artifact was relayed and the attempt recorded, like a client-ping. */
  | {
      kind: 'relayed'
      tx_ref: string
      recorded: boolean
      enqueued: boolean
      settlement: RelaySettlementResponse
    }

export async function relayDraftFunding(
  fastify: FastifyInstance,
  args: {
    escrow: EscrowRow
    user_id: string
    /** The request body, for the optional `signer_address` preference (the one-shot body carries the same field). */
    body: SignerPreferenceBody | null
    payment: RelayPaymentPayload | undefined
    log: FastifyBaseLogger
  },
): Promise<RelayDraftOutcome> {
  const { escrow, user_id, payment } = args
  const { adapter, payload, signer_address } = await prepareDraftCreate(fastify, {
    escrow,
    user_id,
    body: args.body,
  })
  if (adapter.relay === undefined) {
    throw new AppError(503, ErrorCode.RELAY_UNAVAILABLE, `relayed funding is not available on ${escrow.chain_id}`)
  }
  // The creator: the declared wallet, else the primary — which
  // assertCanTransact (inside prepareDraftCreate) has just guaranteed.
  const creator_address =
    signer_address ?? (await resolvePrimaryWalletAddress(fastify.db, user_id, adapter.namespace))
  if (creator_address === null) {
    throw new AppError(422, ErrorCode.ESCROW_WRONG_WALLET, `no ${adapter.namespace} wallet linked`)
  }
  const relayArgs = { user_id, creator_address, payload }

  if (payment === undefined) {
    return { kind: 'payment_required', terms: await adapter.relay.quote(relayArgs) }
  }

  const { tx_ref } = await adapter.relay.relay({ ...relayArgs, payment })
  const result = await recordTxAttempt(
    { store: drizzleTxAttemptsStore(fastify.db), queue: fastify.queue, log: args.log },
    { user_id, escrow_id: escrow.id, action: 'create', tx_ref, chain_id: escrow.chain_id, chain_ns: adapter.namespace },
  )
  return {
    kind: 'relayed',
    tx_ref,
    ...result,
    settlement: { success: true, transaction: tx_ref, network: escrow.chain_id, payer: creator_address },
  }
}
