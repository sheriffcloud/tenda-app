/**
 * v2 escrow primitive: every on-chain action returns an unsigned tx the wallet
 * signs, and the broadcast result is reported via `blockchain.clientPing`.
 * Proofs, review and the off-chain assignment release are satellites.
 */
import {
  apiRoutes,
  type AssignWorkerBody,
  type AddEscrowProofsBody,
  type CreateEscrowApiBody,
  type CreateEscrowApiResponse,
  type DisputeEscrowApiBody,
  type DisputeMessage,
  type DisputeThreadResponse,
  type EscrowActionResponse,
  type EscrowProof,
  type ReleaseAssignmentResponse,
  type ResolveEscrowApiBody,
  type Review,
  type ReviewInput,
  type SendDisputeMessageBody,
  type SubmitEscrowProofBody,
} from '@tenda/shared'
import { request } from '../request'
import {
  ESCROW_CREATE_TIMEOUT_MS,
  PROOF_PERSISTENCE_TIMEOUT_MS,
  TX_BUILD_TIMEOUT_MS,
} from './timeouts'

const { escrows } = apiRoutes

function requestEscrowTransaction(
  path: string,
  params: { id: string },
  body?: object,
): Promise<EscrowActionResponse> {
  return request<EscrowActionResponse>('POST', path, {
    params,
    ...(body !== undefined ? { body } : {}),
    timeout: TX_BUILD_TIMEOUT_MS,
  })
}

export const escrowsApi = {
  create: (body: CreateEscrowApiBody) =>
    request<CreateEscrowApiResponse>('POST', escrows.create, {
      body,
      timeout: ESCROW_CREATE_TIMEOUT_MS,
    }),
  // Publish path for drafts that never got (or lost) their unsigned tx.
  buildCreate: (params: { id: string }) =>
    request<CreateEscrowApiResponse>('POST', escrows.buildCreate, {
      params,
      timeout: TX_BUILD_TIMEOUT_MS,
    }),
  accept: (params: { id: string }) =>
    requestEscrowTransaction(escrows.accept, params),
  decline: (params: { id: string }) =>
    requestEscrowTransaction(escrows.decline, params),
  /** Approval mode: the POSTER signs this one, naming the worker they picked. */
  assign: (params: { id: string }, body: AssignWorkerBody) =>
    requestEscrowTransaction(escrows.assign, params, body),
  /** Approval mode: the poster withdraws an assignment inside the window. */
  unassign: (params: { id: string }) =>
    requestEscrowTransaction(escrows.unassign, params),
  /**
   * The assigned worker says they are not available. OFF-CHAIN — they signed
   * nothing to be assigned, so there is no unsigned tx here and it returns a
   * stamp rather than an `EscrowActionResponse`.
   */
  release: (params: { id: string }) =>
    request<ReleaseAssignmentResponse>('POST', escrows.release, { params }),
  submit: (params: { id: string }, body: SubmitEscrowProofBody) =>
    requestEscrowTransaction(escrows.submit, params, body),
  approve: (params: { id: string }) =>
    requestEscrowTransaction(escrows.approve, params),
  claim: (params: { id: string }) =>
    requestEscrowTransaction(escrows.claim, params),
  cancel: (params: { id: string }) =>
    requestEscrowTransaction(escrows.cancel, params),
  refund: (params: { id: string }) =>
    requestEscrowTransaction(escrows.refund, params),
  // Dispute is the one escrow transition whose EVM buildTx reads on-chain
  // state (the bond's asset), so it inherits the RPC timeout budget.
  dispute: (params: { id: string }, body: DisputeEscrowApiBody) =>
    requestEscrowTransaction(escrows.dispute, params, body),
  // CO7 mediation thread, one shared conversation per dispute.
  disputeThread: (params: { id: string }, query?: { after?: string }) =>
    request<DisputeThreadResponse>('GET', escrows.disputeMessages, { params, query }),
  sendDisputeMessage: (params: { id: string }, body: SendDisputeMessageBody) =>
    request<DisputeMessage>('POST', escrows.sendDisputeMessage, { params, body }),
  resolve: (params: { id: string }, body: ResolveEscrowApiBody) =>
    requestEscrowTransaction(escrows.resolve, params, body),
  delete: (params: { id: string }) =>
    request<{ deleted: true }>('DELETE', escrows.delete, { params }),
  proofs: (params: { id: string }) => request<EscrowProof[]>('GET', escrows.proofs, { params }),
  addProofs: (params: { id: string }, body: AddEscrowProofsBody) =>
    request<EscrowProof[]>('POST', escrows.addProofs, {
      params,
      body,
      timeout: PROOF_PERSISTENCE_TIMEOUT_MS,
    }),
  review: (params: { id: string }, body: ReviewInput) =>
    request<Review>('POST', escrows.review, { params, body }),
}
