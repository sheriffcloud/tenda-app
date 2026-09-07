/**
 * Kind-agnostic escrow action hook (cutover §6), ONE implementation of
 * the v2 client leg shared by the gig and exchange detail screens:
 *
 *   request unsigned tx (escrow.store) → sign + broadcast + client-ping
 *   (wallet/dispatch) → TransactionMonitor/WS confirms → screen refreshes.
 *
 * Proof submission is two-phase: the proofs — file urls AND data payloads
 * (geotag/text/structured) — go to the off-chain satellite
 * (POST /v1/escrows/:id/proofs) first, then the on-chain submit commits a
 * digest over the escrow's whole stored set, read back from the server (see
 * `attachedProofUrls`) rather than taken from the batch just picked. The
 * digest is sha256 over the '\n'-joined identities (a file's url, a data
 * proof's canonical JSON), encoded base58 for Solana chains, 0x-hex for EVM
 * (matching SubmitEscrowProofBody's per-chain format).
 */
import { useState } from 'react'
import { useRouter } from 'expo-router'
import type {
  EscrowProofUpload,
  EscrowTxType,
  TransactionProgressPhase,
  UnsignedTx,
} from '@tenda/shared'
import { useEscrowStore } from '@/stores/escrow.store'
import { errorMessage, PROOF_COPY, WalletError } from '@tenda/shared'
import {
  declaredSignerFor,
  resolveSignersForChain,
  settleSignerFor,
  signSendAndReport,
} from '@/wallet/dispatch'
import { ensureSufficientBalance } from '@/wallet/balances'
import { buildPermitFor } from '@/wallet/permit'
import { api } from '@/api/client'
import { showToast } from '@/components/ui'
import { surfaceTransitionFailure } from '@/features/escrow/transition-failure'
import { persistEscrowProofs } from '@/features/escrow-proofs/persistEscrowProofs'
import { attachedProofUrls } from '@/features/escrow-proofs/attachedProofUrls'
import { proofHashFor } from '@/hooks/escrow/proof-hash'

/**
 * One proof handed to submit/addProofs — the shared wire union (file url OR
 * data payload). The old `ProofFile` name died with the files-only era.
 */
export type EscrowProofInput = EscrowProofUpload

/**
 * Lifecycle of a single transition, drives the progress modal:
 *  - preparing  → building the unsigned tx (server round-trip)
 *  - signing    → wallet is open, awaiting the user's signature
 *  - broadcasting → signed transaction is being submitted to the chain
 *  - confirming → broadcast, waiting on-chain confirmation (pendingTxRef set)
 */
export type TxPhase = TransactionProgressPhase

interface UseEscrowActionsArgs {
  escrowId: string
  chainId: string
  /**
   * The escrow's asset. Every debit this hook can make — the create amount on
   * publish, the dispute bond — is denominated in it (the contracts collect the
   * bond in `escrow.asset`), so it lives here rather than being re-passed per
   * action.
   */
  asset: string
  /** The escrow's amount in base units, debited when a draft is published. */
  amountRaw: string
  /** Called after a tx is broadcast + reported (screen refreshes on WS confirm). */
  onBroadcast?: (txRef: string, action: EscrowTxType) => void
  /**
   * Called when the server refuses because THIS SCREEN is out of date — today
   * only a CO1 takedown. The screen re-reads the detail; nothing else about the
   * failure path changes, and the toast still fires.
   *
   * Optional so a caller that cannot refetch (none today) degrades to the toast
   * rather than being forced to pass a no-op.
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
  /** Feeds TransactionMonitor (signature + escrowId → WS-first confirm). */
  const [pendingTxRef, setPendingTxRef] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<EscrowTxType | null>(null)
  const [phase, setPhase] = useState<TxPhase>('idle')

  function clearPending() {
    setPendingTxRef(null)
    setPendingAction(null)
    setPhase('idle')
  }

  /**
   * A leg that failed BEFORE the wallet opened: unwind the progress state and
   * say which leg it was. The server's message wins; `fallback` names the leg
   * when it has none.
   */
  function failPreparation(error: unknown, fallback: string): false {
    setBusyAction(null)
    setPhase('idle')
    showToast('error', errorMessage(error) || fallback)
    return false
  }

  /**
   * Run a build that carries the SIGNER DECLARATION (publish, accept,
   * dispute). The session is settled first so the address declared is the one
   * that will actually sign — see `settleSignerFor`; declaring before
   * connecting names the primary and then signs with someone else.
   */
  async function withDeclaredSigner(
    build: (signer?: string) => Promise<UnsignedTx>,
  ): Promise<UnsignedTx> {
    await settleSignerFor(chainId)
    return build(declaredSignerFor(chainId))
  }

  /**
   * `debitRaw` declares what this action takes from the signer's wallet, in
   * base units of the escrow's asset. Pass it for value-moving actions only —
   * accept/approve/claim/cancel/refund/submit/decline move nothing from the
   * user (verified against both the EVM and Anchor programs), so a balance
   * read there would be pure latency.
   */
  async function dispatch(
    action: EscrowTxType,
    request: () => Promise<UnsignedTx>,
    debitRaw?: string,
  ): Promise<boolean> {
    setBusyAction(action)
    setPhase('preparing')
    try {
      if (debitRaw !== undefined) {
        await ensureSufficientBalance({
          chainId,
          assetId: asset,
          amountRaw: debitRaw,
          owners: resolveSignersForChain(chainId),
        })
      }
      const unsigned = await request()
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
      return surfaceTransitionFailure(e, { navigate: (route) => router.push(route), onStale })
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

    /** Publish a draft: rebuild + sign the create tx (offramp drafts /
     *  signing-declined retries, the escrow id is preserved). Funds the escrow,
     *  so it debits the full amount. */
    publish: () =>
      dispatch(
        'create',
        () => withDeclaredSigner((signer) => store.requestBuildCreate(escrowId, signer)),
        amountRaw,
      ),
    accept: () =>
      dispatch('accept', () => withDeclaredSigner((signer) => store.requestAccept(escrowId, signer))),
    decline: () => dispatch('decline', () => store.requestDecline(escrowId)),
    /**
     * Approval mode, poster-signed. No `debitRaw`: the escrow is already
     * funded, so assigning moves nothing from the poster's wallet — the same
     * reasoning that keeps accept/approve/cancel off the balance pre-check.
     */
    assign: (workerUserId: string) =>
      dispatch('assign_accept', () => store.requestAssign(escrowId, workerUserId)),
    unassign: () => dispatch('unassign', () => store.requestUnassign(escrowId)),
    approve: () => dispatch('approve', () => store.requestApprove(escrowId)),
    claim: () => dispatch('claim_stalled', () => store.requestClaim(escrowId)),
    cancel: () => dispatch('cancel', () => store.requestCancel(escrowId)),
    /**
     * One endpoint covers both recovery transitions; the PING action must
     * match the on-chain event exactly (verify-tx cross-checks it), so the
     * caller passes which one the escrow's status implies:
     * open → 'refund_expired', accepted → 'reclaim_abandoned'.
     */
    refund: (kind: 'refund_expired' | 'reclaim_abandoned') =>
      dispatch(kind, () => store.requestRefund(escrowId)),

    /**
     * Upload satellite rows first, then commit a digest over the escrow's
     * WHOLE stored proof set on-chain.
     *
     * `proofs` may be EMPTY, and that is the retry path rather than a mistake:
     * a worker whose files uploaded and whose transaction then failed has
     * nothing left to upload, only a signature to give again. The digest comes
     * from the server either way, so the empty case seals exactly the evidence
     * the escrow already holds.
     *
     * Two legs, two fallbacks. Sharing one message told a worker their files
     * had failed to save when it was the READ-BACK that failed — i.e. at the
     * one moment the upload is the thing that did succeed.
     */
    submit: async (proofs: EscrowProofInput[]): Promise<boolean> => {
      setBusyAction('submit')
      setPhase('preparing')
      try {
        if (proofs.length > 0) await persistEscrowProofs(escrowId, proofs)
      } catch (e) {
        return failPreparation(e, PROOF_COPY.saveFailed)
      }
      let urls: string[]
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
     * wallet. The EIP-2612 path covers ERC-20 bonds; a zero bond falls back to
     * the approve hint on the unsigned tx.
     */
    dispute: (reason: string, bondRaw: string) =>
      dispatch(
        'dispute',
        () =>
          withDeclaredSigner(async (signer) => {
            const permit =
              bondRaw !== '0'
                ? await buildPermitFor({ chain_id: chainId, asset, value_raw: bondRaw })
                : undefined
            return store.requestDispute(escrowId, bondRaw, reason, permit, signer)
          }),
        bondRaw,
      ),
  }
}
