'use client'

/**
 * Kind-agnostic escrow action hook — web port of mobile's
 * hooks/useEscrowActions: ONE implementation of the v2 client leg shared by
 * the gig and exchange detail screens:
 *
 *   request unsigned tx (escrow.store) → sign + broadcast + client-ping
 *   (wallet/dispatch) → TransactionMonitor/WS confirms → screen refreshes.
 *
 * Proof submission is two-phase: the proofs — file urls AND data payloads
 * (geotag/text/structured) — go to the off-chain satellite first, then the
 * on-chain submit commits a digest over the escrow's whole stored evidence
 * set (`attachedProofUrls` → `proofHashFor`).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PROOF_COPY,
  TAKEDOWN_REFUSED_MESSAGE,
  TRANSACTION_GATE_MESSAGE,
  WalletError,
  classifyTransactionGateError,
  errorMessage,
  findChain,
  isTakedownRefusal,
  requiredWalletOf,
  transactionGateRoute,
  type EscrowTxType,
  type EscrowProofUpload,
  type TransactionProgressPhase,
  type UnsignedTx,
} from '@tenda/shared'
import { useEscrowStore } from '@/stores/escrow.store'
import {
  declaredSignerFor,
  ensureTxPreconditions,
  resolveSignersForChain,
  signSendAndReport,
} from '@/wallet/dispatch'
import { connectAsWallet } from '@/wallet/send'
import { ensureSufficientBalance } from '@/wallet/balances'
import { buildPermitFor } from '@/wallet/permit'
import { showToast } from '@/components/ui/Toast'
import { attachedProofUrls, persistEscrowProofs } from '@/lib/uploads/escrow-proofs'
import { proofHashFor } from './proof-hash'

/**
 * One proof handed to submit/addProofs — the shared wire union (file url OR
 * data payload). The old `ProofFile` name died with the files-only era.
 */
export type EscrowProofInput = EscrowProofUpload

export type TxPhase = TransactionProgressPhase

interface UseEscrowActionsArgs {
  escrowId: string
  chainId: string
  /**
   * The escrow's asset. Every debit this hook can make — the create amount
   * on publish, the dispute bond — is denominated in it.
   */
  asset: string
  /** The escrow's amount in base units, debited when a draft is published. */
  amountRaw: string
  /** Called after a tx is broadcast + reported (screen refreshes on confirm). */
  onBroadcast?: (txRef: string, action: EscrowTxType) => void
  /**
   * Called when the server refuses because THIS SCREEN is out of date —
   * today only a CO1 takedown. The screen re-reads the detail.
   */
  onStale?: () => void
}

export function useEscrowActions({
  escrowId,
  chainId,
  asset,
  amountRaw,
  onBroadcast,
  onStale,
}: UseEscrowActionsArgs) {
  const store = useEscrowStore()
  const router = useRouter()
  const [busyAction, setBusyAction] = useState<EscrowTxType | null>(null)
  /** Feeds TransactionMonitor (signature + escrowId → confirm). */
  const [pendingTxRef, setPendingTxRef] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<EscrowTxType | null>(null)
  const [phase, setPhase] = useState<TxPhase>('idle')

  function clearPending() {
    setPendingTxRef(null)
    setPendingAction(null)
    setPhase('idle')
  }

  /**
   * Declared on the builds whose signer is still free (publish, accept) and
   * on dispute (where a bound mismatch must answer BEFORE the permit).
   * Evaluated at request time so a wrong-wallet retry re-reads the switched
   * session.
   */
  const declaredSigner = (): string | undefined => declaredSignerFor(chainId)

  /**
   * Abandon a submit before it reaches `dispatch` — the off-chain legs run
   * ahead of it and own their own unwind, since `dispatch`'s own catch has
   * not been entered yet. The server's message wins; `fallback` names which
   * leg failed when it has none.
   */
  function failPreparation(error: unknown, fallback: string): false {
    setBusyAction(null)
    setPhase('idle')
    showToast('error', errorMessage(error) || fallback)
    return false
  }

  /**
   * `debitRaw` declares what this action takes from the signer's wallet, in
   * base units of the escrow's asset. Pass it for value-moving actions only —
   * accept/approve/claim/cancel/refund/submit/decline move nothing from the
   * user (verified against both the EVM and Anchor programs).
   */
  async function dispatch(
    action: EscrowTxType,
    request: () => Promise<UnsignedTx>,
    debitRaw?: string,
  ): Promise<boolean> {
    setBusyAction(action)
    setPhase('preparing')
    try {
      // Trust list + chain registry before signer resolution: an empty
      // wallets[] blanks the owner set and disarms the balance gate.
      await ensureTxPreconditions()
      if (debitRaw !== undefined) {
        await ensureSufficientBalance({
          chainId,
          assetId: asset,
          amountRaw: debitRaw,
          owners: resolveSignersForChain(chainId),
        })
      }
      // Wrong-wallet retry (signer contract): the server refused because the
      // escrow is bound to a specific wallet — connect exactly that one and
      // re-run the build ONCE. Re-running the closure is what rebuilds a
      // dispute permit for the right owner. connectAsWallet's own typed
      // errors (dismissed, unlinked-bound) fall through to the guard exits.
      let unsigned: UnsignedTx
      try {
        unsigned = await request()
      } catch (e) {
        const required = requiredWalletOf(e)
        const ns = findChain(chainId)?.namespace
        if (required === null || ns === undefined) throw e
        await connectAsWallet(ns, required)
        unsigned = await request()
      }
      setPhase('signing')
      const tx_ref = await signSendAndReport({
        unsigned,
        action,
        chain_id: chainId,
        escrow_id: escrowId,
        onSigned: () => setPhase('broadcasting'),
      })
      setPendingTxRef(tx_ref)
      setPendingAction(action)
      setPhase('confirming')
      onBroadcast?.(tx_ref, action)
      return true
    } catch (e) {
      setPhase('idle')
      // First-transaction gate (9D): route to link-wallet / verify-contact
      // instead of a dead-end toast.
      const gate = classifyTransactionGateError(e)
      if (gate !== null) {
        showToast('error', TRANSACTION_GATE_MESSAGE[gate])
        router.push(transactionGateRoute(gate))
        return false
      }
      // Guard exits (Cancel / lost wallet response) are expected paths.
      if (e instanceof WalletError && (e.code === 'declined' || e.code === 'timeout')) {
        showToast('info', e.message)
        return false
      }
      // Taken down (CO1) while this screen was open: re-read so the button
      // the user just pressed stops being offered. The server's message is
      // preferred; the fallback is the SHARED constant the server sends.
      if (isTakedownRefusal(e)) {
        showToast('error', errorMessage(e) || TAKEDOWN_REFUSED_MESSAGE)
        onStale?.()
        return false
      }
      showToast('error', errorMessage(e) || 'Transaction failed, please try again')
      return false
    } finally {
      setBusyAction(null)
    }
  }

  return {
    busyAction,
    pendingTxRef,
    pendingAction,
    /** Lifecycle for the progress modal (preparing → signing → broadcasting → confirming). */
    phase,
    /** Action currently in flight across all phases (build → confirm). */
    activeAction: busyAction ?? pendingAction,
    clearPending,

    /** Publish a draft: rebuild + sign the create tx. Funds the escrow, so it
     *  debits the full amount. */
    publish: () => dispatch('create', () => store.requestBuildCreate(escrowId, declaredSigner()), amountRaw),
    accept: () => dispatch('accept', () => store.requestAccept(escrowId, declaredSigner())),
    decline: () => dispatch('decline', () => store.requestDecline(escrowId)),
    /** Approval mode, poster-signed. No `debitRaw`: the escrow is already funded. */
    assign: (workerUserId: string) =>
      dispatch('assign_accept', () => store.requestAssign(escrowId, workerUserId)),
    unassign: () => dispatch('unassign', () => store.requestUnassign(escrowId)),
    approve: () => dispatch('approve', () => store.requestApprove(escrowId)),
    claim: () => dispatch('claim_stalled', () => store.requestClaim(escrowId)),
    cancel: () => dispatch('cancel', () => store.requestCancel(escrowId)),
    /**
     * One endpoint covers both recovery transitions; the PING action must
     * match the on-chain event exactly (verify-tx cross-checks it):
     * open → 'refund_expired', accepted → 'reclaim_abandoned'.
     */
    refund: (kind: 'refund_expired' | 'reclaim_abandoned') =>
      dispatch(kind, () => store.requestRefund(escrowId)),

    /**
     * Upload satellite rows first, then commit the digest on-chain.
     *
     * `proofs` may be EMPTY, and that is the retry path rather than a caller
     * bug: the upload and the transaction are two legs, and only the second
     * one fails when a wallet is declined. The files are already stored, so a
     * retry has nothing to upload — it only has to sign. (The POST rejects an
     * empty batch, hence the guard rather than a call with no rows.)
     *
     * The digest covers the escrow's whole stored evidence set, read back
     * after the upload — see `attachedProofUrls` for why that and not the
     * batch.
     */
    submit: async (proofs: EscrowProofInput[]): Promise<boolean> => {
      setBusyAction('submit')
      setPhase('preparing')
      // Two legs, two fallbacks. Sharing one message told a worker their files
      // had failed to save when it was the READ-BACK that failed — i.e. at the
      // one moment the upload is the thing that did succeed. The fallback is
      // reachable: `request()` takes the message from the parsed error body,
      // so a gateway answering a JSON envelope without one lands here.
      let urls: string[]
      try {
        if (proofs.length > 0) await persistEscrowProofs(escrowId, proofs)
      } catch (e) {
        return failPreparation(e, PROOF_COPY.saveFailed)
      }
      try {
        urls = await attachedProofUrls(escrowId)
      } catch (e) {
        return failPreparation(e, 'Could not read the proof on this escrow, please try again')
      }
      const proof_hash = proofHashFor(chainId, urls)
      return dispatch('submit', () => store.requestSubmit(escrowId, proof_hash))
    },

    /** Supplementary evidence while submitted, off-chain only. */
    addProofs: async (proofs: EscrowProofInput[]): Promise<boolean> => {
      try {
        await persistEscrowProofs(escrowId, proofs)
        showToast('success', 'Proof added!')
        return true
      } catch (e) {
        showToast('error', errorMessage(e) || 'Failed to add proof, please try again')
        return false
      }
    },

    /**
     * The raiser posts the bond in the escrow's own asset, so it debits their
     * wallet. The EIP-2612 path covers ERC-20 bonds; a zero bond falls back
     * to the approve hint on the unsigned tx.
     */
    dispute: (reason: string, bondRaw: string) =>
      dispatch(
        'dispute',
        async () => {
          const permit =
            bondRaw !== '0'
              ? await buildPermitFor({ chain_id: chainId, asset, value_raw: bondRaw })
              : undefined
          return store.requestDispute(escrowId, bondRaw, reason, permit, declaredSigner())
        },
        bondRaw,
      ),
  }
}
