/**
 * v2 escrow transition store (cutover §6), replaces the transition methods
 * scattered across gigs.store.ts / p2p-exchange.store.ts. Display stores
 * keep owning their listing/detail state; this store owns the
 * sign-and-report lifecycle shared by both kinds:
 *
 *   request<Action>() → unsigned tx → wallet signs + broadcasts →
 *   reportTx() (client-ping; server verifies async) →
 *   screens refresh their display store when the verified event lands.
 *
 * The wallet is NOT imported here, screens pass the signed tx_ref in.
 * Keeping signing out of the store means one store serves MWA today and
 * the Stage-1 adapter façade after promotion.
 */

import { create } from 'zustand'
import type {
  ClientPingResponse,
  CreateEscrowApiBody,
  CreateEscrowApiResponse,
  EscrowTxType,
  PermitSignatureBody,
  SignerPreferenceBody,
  UnsignedTx,
} from '@tenda/shared'
import { ErrorCode, ApiClientError, errorMessage, registerAccountReset } from '@tenda/shared'
import { api } from '@/api/client'
import { usePendingSyncStore } from '@/stores/pending-sync.store'

interface EscrowState {
  /** True while a request/report round-trip is in flight. */
  isBusy: boolean
  error: string | null

  /** POST /v1/escrows, returns the draft id + unsigned createEscrow tx. */
  createEscrow: (body: CreateEscrowApiBody) => Promise<CreateEscrowApiResponse>

  /** Transition builders, each returns the unsigned tx to sign. */
  /**
   * Rebuild the unsigned create tx for an owned draft (publish path).
   * `signer_address` = the wallet this client intends to sign with. The
   * signer is still FREE on this build, so the server bakes whatever it is
   * told — omitting it means the primary is baked while the user signs with
   * the connected wallet.
   */
  requestBuildCreate: (id: string, signer_address?: string) => Promise<UnsignedTx>
  /** Public accept: free signer, same declaration as requestBuildCreate. */
  requestAccept: (id: string, signer_address?: string) => Promise<UnsignedTx>
  requestDecline: (id: string) => Promise<UnsignedTx>
  /**
   * Approval mode: the POSTER signs, naming the applicant they picked. The
   * worker's address is resolved server-side from their user id — the client
   * never handles someone else's wallet.
   */
  requestAssign: (id: string, worker_user_id: string) => Promise<UnsignedTx>
  /** Approval mode: the poster withdraws an assignment inside the window. */
  requestUnassign: (id: string) => Promise<UnsignedTx>
  requestSubmit: (id: string, proof_hash: string) => Promise<UnsignedTx>
  requestApprove: (id: string) => Promise<UnsignedTx>
  requestClaim: (id: string) => Promise<UnsignedTx>
  requestCancel: (id: string) => Promise<UnsignedTx>
  requestRefund: (id: string) => Promise<UnsignedTx>
  requestDispute: (
    id: string,
    bond_raw: string,
    reason: string,
    permit?: PermitSignatureBody,
    /**
     * Declared signer. Dispute is a BOUND transition, so this is not a choice
     * — a mismatch answers 422 naming the wallet the escrow needs, which is
     * how the client learns to re-target BEFORE a doomed broadcast (and
     * before the permit is signed by the wrong owner).
     */
    signer_address?: string,
  ) => Promise<UnsignedTx>
  requestResolve: (
    id: string,
    winner: 'creator' | 'counterparty' | 'split',
  ) => Promise<UnsignedTx>

  /**
   * Report a broadcast tx for async verification. On network failure the
   * ping is queued in pending-sync and replayed on next foreground.
   */
  reportTx: (input: {
    tx_ref: string
    action: EscrowTxType
    chain_id: string
    escrow_id?: string
  }) => Promise<ClientPingResponse | { status: 'deferred' }>
}

/**
 * The optional signer declaration as a body — `undefined` rather than
 * `{ signer_address: undefined }`, because the endpoint's body is optional and
 * an empty object is a different request from no body at all.
 */
function signerBody(signer_address?: string): SignerPreferenceBody | undefined {
  return signer_address === undefined ? undefined : { signer_address }
}

export const useEscrowStore = create<EscrowState>((set) => {
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    set({ isBusy: true, error: null })
    try {
      const result = await fn()
      set({ isBusy: false })
      return result
    } catch (e) {
      // '' when the throw carried no words of its own — the caller's catch is
      // what surfaces copy; this field is state, and inventing a sentence here
      // would put it in two places.
      set({ isBusy: false, error: errorMessage(e) })
      throw e
    }
  }

  return {
    isBusy: false,
    error: null,

    createEscrow: (body) => run(() => api.escrows.create(body)),

    requestBuildCreate: (id, signer_address) =>
      run(async () => (await api.escrows.buildCreate({ id }, signerBody(signer_address))).unsigned),
    requestAccept: (id, signer_address) =>
      run(async () => (await api.escrows.accept({ id }, signerBody(signer_address))).unsigned),
    requestDecline: (id) => run(async () => (await api.escrows.decline({ id })).unsigned),
    requestAssign: (id, worker_user_id) =>
      run(async () => (await api.escrows.assign({ id }, { worker_user_id })).unsigned),
    requestUnassign: (id) => run(async () => (await api.escrows.unassign({ id })).unsigned),
    requestSubmit: (id, proof_hash) =>
      run(async () => (await api.escrows.submit({ id }, { proof_hash })).unsigned),
    requestApprove: (id) => run(async () => (await api.escrows.approve({ id })).unsigned),
    requestClaim: (id) => run(async () => (await api.escrows.claim({ id })).unsigned),
    requestCancel: (id) => run(async () => (await api.escrows.cancel({ id })).unsigned),
    requestRefund: (id) => run(async () => (await api.escrows.refund({ id })).unsigned),
    requestDispute: (id, bond_raw, reason, permit, signer_address) =>
      run(
        async () =>
          (
            await api.escrows.dispute(
              { id },
              {
                bond_raw,
                reason,
                ...(permit !== undefined ? { permit } : {}),
                ...(signer_address !== undefined ? { signer_address } : {}),
              },
            )
          ).unsigned,
      ),
    requestResolve: (id, winner) =>
      run(async () => (await api.escrows.resolve({ id }, { winner })).unsigned),

    reportTx: async (input) => {
      try {
        return await api.blockchain.clientPing({
          tx_ref: input.tx_ref,
          action: input.action,
          chain_id: input.chain_id,
          ...(input.escrow_id !== undefined ? { escrow_id: input.escrow_id } : {}),
        })
      } catch (e) {
        // DEFENSIVE: the current v2 client-ping never 409s a duplicate --
        // tx_attempts inserts with onConflictDoNothing and replays answer 202
        // {recorded:false} (server routes/v1/blockchain/transaction.ts). The
        // branch stays because DUPLICATE_SIGNATURE is still in the contract
        // enum: if a server reintroduces it, "already recorded" must read as
        // success. Matched on `code` -- `error` is the HTTP label
        // ('Conflict') and can never equal an ErrorCode.
        if (
          e instanceof ApiClientError &&
          e.statusCode === 409 &&
          e.code === ErrorCode.DUPLICATE_SIGNATURE
        ) {
          return { status: 'queued', recorded: false, enqueued: false }
        }
        // Any other 4xx means the server understood and rejected,
        // replaying the identical ping can never succeed, so surface it.
        if (e instanceof ApiClientError && e.statusCode < 500) throw e
        // Offline / 5xx, the signed tx is already on chain; queue the ping
        // so verification is only delayed, never lost.
        usePendingSyncStore.getState().add({
          action: 'escrow_ping',
          escrowId: input.escrow_id ?? null,
          chainId: input.chain_id,
          txAction: input.action,
          signature: input.tx_ref,
        })
        return { status: 'deferred' as const }
      }
    },
  }
})

// Only the transient action flags live here — no escrow content — but a
// `isBusy: true` left over from the previous account would gray out the next
// account's first action until something else reset it.
registerAccountReset(() => useEscrowStore.setState({ isBusy: false, error: null }))
