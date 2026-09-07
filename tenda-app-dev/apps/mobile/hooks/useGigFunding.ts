/**
 * The post-a-gig funding lifecycle, extracted from the screen so the screen
 * stays a view. Sibling to useEscrowActions: that one drives transitions on an
 * EXISTING escrow, this one drives creation.
 *
 * Confirmed → v2 create chain (cutover §6): 1) draft escrow + unsigned create
 * tx, 2) attach gig_details (Stage-6 moderation gate, a block deletes the
 * orphan draft), 3) wallet signs + broadcasts + client-pings. The gig goes live
 * (draft → open) when the verify pipeline confirms the tx; the progress modal
 * holds until then.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import {
  coerceCityForCountry,
  ErrorCode,
  type EscrowCreationAttempt,
  reuseOrCreateEscrowCreationAttempt,
  SECONDS_PER_HOUR,
} from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { ApiClientError, checkEscrowTransitionApplied, randomUuid } from '@tenda/shared'
import { showToast } from '@/components/ui/Toast'
import { WalletError } from '@tenda/shared'
import {
  declaredSignerFor,
  resolveSignersForChain,
  settleSignerFor,
  signSendAndReport,
} from '@/wallet/dispatch'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { ensureSufficientBalance } from '@/wallet/balances'
import { buildPermitFor } from '@/wallet/permit'
import type { TxPhase } from '@/hooks/useEscrowActions'
import {
  classifyTransactionGateError,
  TRANSACTION_GATE_MESSAGE,
  transactionGateRoute,
} from '@tenda/shared'
import type { GigFormValues } from '@tenda/shared'


interface FundingMonitor {
  signature: string
  escrowId: string
  chainId: string
}

interface UseGigFundingArgs {
  /** Present when reposting an abandoned draft (CO6 retry-from-draft). */
  draftId?: string
  /**
   * Blank the composer (fields + any draft prefill). Called once the composed
   * values have been committed to the server — either funded, or persisted as a
   * draft — because Post-a-Gig is a tab screen that never unmounts, so without
   * this the next visit still shows the gig the user already posted.
   */
  resetForm: () => void
}

export function useGigFunding({ draftId, resetForm }: UseGigFundingArgs) {
  const router = useRouter()
  // pendingValues drives the confirm dialog; once confirmed, phase + signature
  // drive the shared progress modal, which holds until the escrow confirms
  // on-chain (then we navigate).
  const [pendingValues, setPendingValues] = useState<GigFormValues | null>(null)
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [monitor, setMonitor] = useState<FundingMonitor | null>(null)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const creationAttempt = useRef<EscrowCreationAttempt | null>(null)

  /** The wallets[] load, read off the store rather than subscribed to: this
   *  hook renders nothing, so a subscription would only add re-renders. */
  const refreshLinkedWallets = () => useAuthStore.getState().refreshMe()

  async function runFunding() {
    if (pendingValues === null || !pendingValues.category) return
    const values = pendingValues
    const category = pendingValues.category
    setPendingValues(null)

    const safeCity = coerceCityForCountry(values.country, values.city)
    // CO5: chain + USDC asset come from the form's picker (policy pair from the
    // shared gigAssetByChain helper, the server re-asserts it).
    const chain_id = values.chainId
    const asset = values.asset
    // Already a canonical base-unit string — the composer never holds it as
    // a number, so there is nothing left to stringify.
    const amount_raw = values.paymentRaw
    creationAttempt.current = reuseOrCreateEscrowCreationAttempt(
      creationAttempt.current,
      [chain_id, asset, amount_raw, values.acceptDeadlineHours, values.completionDuration,
        values.requiresApproval],
      randomUuid,
    )
    const { operationId } = creationAttempt.current

    setPhase('preparing')
    let escrow_id: string | null = null
    try {
      // Before the permit signature and the draft: an underfunded creator would
      // otherwise sign a permit, wait, and watch the create revert — leaving a
      // draft to retry. Falls open when the balance can't be read.
      await ensureSufficientBalance({
        chainId: chain_id,
        assetId: asset,
        amountRaw: amount_raw,
        owners: resolveSignersForChain(chain_id),
      })

      // EIP-2612: sign the allowance BEFORE creating so it rides the create tx
      // (undefined = approve fallback via the unsigned tx's approval hint).
      const permit = await buildPermitFor({ chain_id, asset, value_raw: amount_raw })
      // Declared signer: the wallet the create BAKES. Settled first so it is
      // the wallet that will actually sign — and so it is the same account the
      // permit above was signed by, which the contract requires.
      await settleSignerFor(chain_id)
      const signer = declaredSignerFor(chain_id)
      const created = await api.escrows.create({
        creation_operation_id: operationId,
        kind: 'gig',
        chain_id,
        asset,
        amount_raw,
        ...(signer !== undefined ? { signer_address: signer } : {}),
        // A DURATION: the server anchors it when it builds the create (#41).
        accept_window_seconds: values.acceptDeadlineHours * SECONDS_PER_HOUR,
        completion_duration_seconds: values.completionDuration,
        // Only sent when true: the server treats an absent flag as instant
        // mode, so an omitted `false` and an explicit one mean the same thing
        // and the smaller body is the honest one.
        ...(values.requiresApproval ? { requires_approval: true } : {}),
        ...(permit !== undefined ? { permit } : {}),
      })
      escrow_id = created.escrow_id
      creationAttempt.current = null

      try {
        await api.gigs.create({
          escrow_id: created.escrow_id,
          title: values.title.trim(),
          description: values.description.trim() || undefined,
          category,
          country: values.country ?? undefined,
          remote: values.remote,
          city: safeCity || undefined,
          ...(values.proofRequirements.length > 0
            ? { proof_requirements: values.proofRequirements }
            : {}),
          // The check-in pin + per-type params, already scoped to the selected
          // requirement types by composerProofSubmission in the form.
          ...(values.latitude !== null && values.longitude !== null
            ? { latitude: values.latitude, longitude: values.longitude }
            : {}),
          ...(values.proofParams !== null ? { proof_params: values.proofParams } : {}),
        })
      } catch (e) {
        // Stage-6 block (or validation failure): the chain-agnostic draft would
        // be an orphan, discard it before surfacing the error.
        await api.escrows.delete({ id: created.escrow_id }).catch(() => {})
        escrow_id = null
        throw e
      }

      // Retry-from-draft: the listing now lives on the NEW draft, discard the
      // abandoned one. A 409 (its create tx is still pending) leaves it alone;
      // it stays deletable from its own page.
      if (draftId !== undefined && draftId !== created.escrow_id) {
        await api.escrows.delete({ id: draftId }).catch(() => {})
      }

      setPhase('signing')
      const tx_ref = await signSendAndReport({
        unsigned: created.unsigned,
        action: 'create',
        chain_id,
        escrow_id: created.escrow_id,
      })

      // Hold the progress modal on-chain-confirm instead of navigating away
      // blind (the newcomer's "did it work?" gap).
      setPhase('confirming')
      setMonitor({ signature: tx_ref, escrowId: created.escrow_id, chainId: chain_id })
    } catch (e) {
      setPhase('idle')
      // 9D first-transaction gate. It surfaces from escrows.create() before
      // escrow_id is set, so there is no orphan draft to clean up here. The
      // two halves part company at #59: the CONTACT gate still routes, the
      // WALLET gate answers in place (see below).
      const gate = classifyTransactionGateError(e)
      if (gate !== null) {
        showToast('error', TRANSACTION_GATE_MESSAGE[gate])
        if (gate === 'wallet_required') {
          // #59: the composer STAYS. This screen is a tab and does not
          // unmount, so the old push did not destroy the fields the way web's
          // route change did — it BURIED them under Settings, mid-compose,
          // answering a fixable precondition by throwing the poster somewhere
          // else. The notice at the top of the composer answers it in place
          // instead, and refreshing wallets[] is what makes that notice
          // appear: the server has just contradicted what this client
          // believed, so the list it believed it from is the stale thing.
          void refreshLinkedWallets()
        } else {
          router.push(transactionGateRoute(gate))
        }
      } else if (e instanceof ApiClientError && e.code === ErrorCode.CONTENT_MODERATED) {
        // Stage-6: block verdicts get the full dialog, no retry path.
        setBlockedMessage(e.message)
      } else if (escrow_id !== null) {
        // Details saved but signing failed/declined/timed out, the draft
        // survives with a Delete Draft CTA on its page. If the wallet actually
        // broadcast a timed-out create, the server's chain listener confirms
        // it and the draft flips to open on its own.
        showToast('info', e instanceof Error ? e.message : 'Signing incomplete, draft saved')
        resetComposer()
        router.push(`/gig/${escrow_id}`)
      } else if (e instanceof WalletError && (e.code === 'declined' || e.code === 'timeout')) {
        // Guard exit before the draft existed (e.g. the permit signature was
        // cancelled or lost) — an expected path, not a failure.
        showToast('info', e.message)
      } else {
        // Covers InsufficientBalanceError, whose message names the shortfall.
        showToast('error', e instanceof Error ? e.message : 'Failed to create gig')
      }
    }
  }

  // The composer's contents now live on the server (as a live gig or as a
  // draft), so the screen must go back to blank — it stays mounted behind the
  // tab bar, and a retry belongs to the draft's own "Edit & repost" entry, not
  // to leftover state here.
  function resetComposer() {
    resetForm()
    if (draftId !== undefined) router.setParams({ draftId: '' })
  }

  // Tear down the progress modal, clear the retry-draft param, and land on the
  // gig's page. Shared by the confirmed and timed-out exits (they differ only
  // in the toast).
  function leaveAfterFunding(type: 'success' | 'info', message: string) {
    const escrowId = monitor?.escrowId
    setMonitor(null)
    setPhase('idle')
    showToast(type, message)
    resetComposer()
    router.navigate('/(tabs)/home')
    if (escrowId !== undefined) router.push(`/gig/${escrowId}`)
  }

  return {
    pendingValues,
    setPendingValues,
    phase,
    monitor,
    blockedMessage,
    dismissBlocked: () => setBlockedMessage(null),
    runFunding,
    checkApplied: () => {
      const escrowId = monitor?.escrowId
      if (escrowId === undefined) return Promise.resolve(false)
      return checkEscrowTransitionApplied('create', () => api.gigs.get({ id: escrowId }))
    },
    /** Escrow confirmed on-chain → the gig is live. */
    handleFunded: () => {
      // First real commitment, this is what earns the just-in-time notification
      // re-ask for a user who declined earlier.
      void useNotificationPromptStore.getState().recordCommitment()
      leaveAfterFunding('success', 'Gig funded and live!')
    },
    /**
     * Timed out / soft failure: the escrow will sync when it confirms; land on
     * the gig page (draft or live) rather than trapping the user in the modal.
     */
    handleFundTimeout: (msg: string) =>
      leaveAfterFunding('info', msg || 'Submitted — it will go live once the escrow confirms.'),
  }
}
