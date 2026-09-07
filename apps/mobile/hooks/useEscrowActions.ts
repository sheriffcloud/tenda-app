/**
 * Kind-agnostic escrow action hook (cutover §6), ONE implementation of
 * the v2 client leg shared by the gig and exchange detail screens:
 *
 *   request unsigned tx (escrow.store) → sign + broadcast + client-ping
 *   (wallet/dispatch) → TransactionMonitor/WS confirms → screen refreshes.
 *
 * Proof submission is two-phase: the proof FILES go to the off-chain
 * satellite (POST /v1/escrows/:id/proofs) first, then the on-chain submit
 * commits a digest over their URLs. The digest is sha256 over the
 * '\n'-joined URLs in upload order, encoded base58 for Solana chains,
 * 0x-hex for EVM (matching SubmitEscrowProofBody's per-chain format).
 */
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { sha256 } from '@noble/hashes/sha256'
import { Buffer } from 'buffer'
import bs58 from 'bs58'
import { TAKEDOWN_REFUSED_MESSAGE } from '@tenda/shared'
import type {
  EscrowTxType,
  ProofType,
  TransactionProgressPhase,
  UnsignedTx,
} from '@tenda/shared'
import { useEscrowStore } from '@/stores/escrow.store'
import { WalletError } from '@/wallet/errors'
import { resolveSignersForChain, signSendAndReport } from '@/wallet/dispatch'
import { ensureSufficientBalance } from '@/wallet/balances'
import { buildPermitFor } from '@/wallet/permit'
import { api } from '@/api/client'
import { showToast } from '@/components/ui'
import {
  classifyTransactionGateError,
  TRANSACTION_GATE_MESSAGE,
  transactionGateRoute,
} from '@/lib/transaction-gate'
import { isTakedownRefusal } from '@/lib/takedown-refusal'
import { persistEscrowProofs } from '@/features/escrow-proofs/persistEscrowProofs'

export interface ProofFile {
  url: string
  type: ProofType
}

/**
 * Lifecycle of a single transition, drives the progress modal:
 *  - preparing  → building the unsigned tx (server round-trip)
 *  - signing    → wallet is open, awaiting the user's signature
 *  - broadcasting → signed transaction is being submitted to the chain
 *  - confirming → broadcast, waiting on-chain confirmation (pendingTxRef set)
 */
export type TxPhase = TransactionProgressPhase

export function proofHashFor(chainId: string, urls: string[]): string {
  const digest = sha256(new TextEncoder().encode(urls.join('\n')))
  return chainId.startsWith('solana:')
    ? bs58.encode(digest)
    : `0x${Buffer.from(digest).toString('hex')}`
}

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
      // First-transaction gate (9D): route to link-wallet / verify-contact
      // instead of a dead-end toast. The 403 surfaces from request() (the
      // server build-tx call), before any wallet signing.
      const gate = classifyTransactionGateError(e)
      if (gate !== null) {
        showToast('error', TRANSACTION_GATE_MESSAGE[gate])
        router.push(transactionGateRoute(gate))
        return false
      }
      // Guard exits (Cancel button / lost wallet response) are expected paths,
      // not failures — the message already says whether the tx may still sync.
      if (e instanceof WalletError && (e.code === 'declined' || e.code === 'timeout')) {
        showToast('info', e.message)
        return false
      }
      // Taken down (CO1) while this screen was open: the refusal is the FIRST
      // the client hears of it, so a toast alone would leave the same button
      // sitting there to be pressed again. Re-read instead — the party lands on
      // the takedown notice with the entry actions gone, everyone else on "not
      // available". The server's message is preferred — it is written for a
      // stranger whose screen simply went stale — but it falls back to the
      // SHARED constant the server itself sends, not to the generic "please try
      // again" below: a blank envelope must not turn "this listing is gone"
      // into advice to retry something that will be refused every time.
      if (isTakedownRefusal(e)) {
        showToast('error', (e as Error).message || TAKEDOWN_REFUSED_MESSAGE)
        onStale?.()
        return false
      }
      showToast('error', (e as Error).message || 'Transaction failed, please try again')
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

    /** Publish a draft: rebuild + sign the create tx (offramp drafts /
     *  signing-declined retries, the escrow id is preserved). Funds the escrow,
     *  so it debits the full amount. */
    publish: () => dispatch('create', () => store.requestBuildCreate(escrowId), amountRaw),
    accept: () => dispatch('accept', () => store.requestAccept(escrowId)),
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

    /** Upload satellite rows first, then commit the digest on-chain. */
    submit: async (proofs: ProofFile[]): Promise<boolean> => {
      setBusyAction('submit')
      setPhase('preparing')
      try {
        await persistEscrowProofs(escrowId, proofs)
      } catch (e) {
        setBusyAction(null)
        setPhase('idle')
        showToast('error', (e as Error).message || 'Failed to save proof files')
        return false
      }
      const proof_hash = proofHashFor(chainId, proofs.map((p) => p.url))
      return dispatch('submit', () => store.requestSubmit(escrowId, proof_hash))
    },

    /** Supplementary evidence while submitted, off-chain only. */
    addProofs: async (proofs: ProofFile[]): Promise<boolean> => {
      try {
        await persistEscrowProofs(escrowId, proofs)
        showToast('success', 'Proof added!')
        return true
      } catch (e) {
        showToast('error', (e as Error).message || 'Failed to add proof, please try again')
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
        async () => {
          const permit =
            bondRaw !== '0'
              ? await buildPermitFor({ chain_id: chainId, asset, value_raw: bondRaw })
              : undefined
          return store.requestDispute(escrowId, bondRaw, reason, permit)
        },
        bondRaw,
      ),
  }
}
