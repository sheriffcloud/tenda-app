/**
 * v2 escrow transition store — web port of apps/mobile/stores/escrow.store.ts.
 * Owns the sign-and-report lifecycle shared by the gig and exchange kinds:
 *
 *   request<Action>() → unsigned tx → wallet signs + broadcasts →
 *   reportTx() (client-ping; server verifies async) →
 *   screens refresh their display state when the verified event lands.
 *
 * The wallet is NOT imported here, screens pass the signed tx_ref in.
 *
 * DIVERGENCE from mobile, deliberate: mobile queues a failed ping in its
 * pending-sync store and replays it on foreground. Web has no pending-sync
 * yet (Stage 5), so an offline/5xx ping returns `{ status: 'deferred' }`
 * un-queued — safe because the ping is a HINT: the server's chain listeners
 * + reconcile converge on the broadcast tx without it (stage-4 doctrine).
 */
import { create } from 'zustand'
import type {
  ClientPingResponse,
  CreateEscrowApiBody,
  CreateEscrowApiResponse,
  EscrowTxType,
  PermitSignatureBody,
  UnsignedTx,
} from '@tenda/shared'
import { ErrorCode, ApiClientError, errorMessage } from '@tenda/shared'
import { api } from '@/api/client'
import { accountGeneration, isSameAccount, registerAccountReset } from '@/lib/account-state'

interface EscrowState {
  /** True while a request/report round-trip is in flight. */
  isBusy: boolean
  error: string | null

  /** POST /v1/escrows, returns the draft id + unsigned createEscrow tx. */
  createEscrow: (body: CreateEscrowApiBody) => Promise<CreateEscrowApiResponse>

  /** Transition builders, each returns the unsigned tx to sign. */
  /** Rebuild the unsigned create tx for an owned draft (publish path).
   *  `signer_address` = the wallet this client intends to sign with
   *  (the free-signer declaration; see the signer contract). */
  requestBuildCreate: (id: string, signer_address?: string) => Promise<UnsignedTx>
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
    /** Declared signer: a bound mismatch answers 422 naming the required
     *  wallet BEFORE a doomed broadcast (the dispatch retry re-targets). */
    signer_address?: string,
  ) => Promise<UnsignedTx>

  /**
   * Report a broadcast tx for async verification. Best-effort (see module
   * note): a network failure defers to the server's own convergence.
   */
  reportTx: (input: {
    tx_ref: string
    action: EscrowTxType
    chain_id: string
    escrow_id?: string
  }) => Promise<ClientPingResponse | { status: 'deferred' }>
  /** Drop the in-flight flag and the last error — see the foot of this file. */
  reset: () => void
}

const EMPTY = { isBusy: false, error: null } as const

export const useEscrowStore = create<EscrowState>((set) => {
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    // #45: the message this writes on failure is the SERVER's, naming what
    // this account was refused. Landing after a sign-out it would sit on the
    // next account's first transition screen. The isBusy half is harmless
    // either way — false is what the reset leaves — but it rides the same
    // guard rather than being reasoned about separately at each call site.
    const gen = accountGeneration()
    set({ isBusy: true, error: null })
    try {
      const result = await fn()
      if (isSameAccount(gen)) set({ isBusy: false })
      return result
    } catch (e) {
      // '' when the throw carried no words of its own — the caller's catch is
      // what surfaces copy; this field is state, and inventing a sentence here
      // would put it in two places.
      if (isSameAccount(gen)) set({ isBusy: false, error: errorMessage(e) })
      throw e
    }
  }

  return {
    ...EMPTY,

    reset: () => set(EMPTY),

    createEscrow: (body) => run(() => api.escrows.create(body)),

    requestBuildCreate: (id, signer_address) =>
      run(async () =>
        (
          await api.escrows.buildCreate(
            { id },
            signer_address !== undefined ? { signer_address } : undefined,
          )
        ).unsigned,
      ),
    requestAccept: (id, signer_address) =>
      run(async () =>
        (
          await api.escrows.accept(
            { id },
            signer_address !== undefined ? { signer_address } : undefined,
          )
        ).unsigned,
      ),
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

    reportTx: async (input) => {
      try {
        return await api.blockchain.clientPing({
          tx_ref: input.tx_ref,
          action: input.action,
          chain_id: input.chain_id,
          ...(input.escrow_id !== undefined ? { escrow_id: input.escrow_id } : {}),
        })
      } catch (e) {
        // DEFENSIVE: the current v2 client-ping never 409s a duplicate —
        // tx_attempts inserts with onConflictDoNothing and replays answer 202
        // {recorded:false} (verified in server routes/v1/blockchain/
        // transaction.ts). The branch stays because DUPLICATE_SIGNATURE is
        // still in the shared contract enum: if a server ever reintroduces
        // it, "already recorded" must read as success, not an error. Matched
        // on `code` (the machine-readable field) — `error` carries the HTTP
        // label ('Conflict') and can never equal an ErrorCode.
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
        // Offline / 5xx: the signed tx is already on chain; the server's
        // listener/reconcile pipeline confirms it without the ping.
        return { status: 'deferred' as const }
      }
    },
  }
})

/**
 * ACCOUNT-SCOPED, weakly but really. It holds no rows — only `isBusy` and the
 * last transition `error`, and that error is the SERVER's message, which names
 * what the previous account was refused ("Only the escrow creator can …").
 * Left standing it can surface on the next account's first render of a
 * transition screen, before any call of theirs has set or cleared it.
 */
registerAccountReset(() => useEscrowStore.getState().reset())
