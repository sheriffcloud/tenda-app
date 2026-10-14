/**
 * The escrow detail screens' shared `TransactionMonitor` wiring.
 *
 * Both detail surfaces — gig and exchange — mount the monitor with the same
 * seven of its eight inputs, differing only in which read endpoint proves the
 * transition landed and which refetch re-reads the screen. Duplicating that
 * meant the two hubs could drift on the part that is genuinely shared, and the
 * failure behaviour below is exactly the part that must not: a transaction
 * that broadcast and then failed leaves the screen describing a state the
 * chain never reached.
 *
 * `onFailed` is owned here rather than passed in. The case that made the
 * re-read necessary is the proof submit: a failed submit leaves the uploaded
 * proofs stored, and the retry has to see them — so the screen must re-read
 * whatever the action was, on every failure, not only on the ones a caller
 * remembered to handle.
 *
 * `onConfirmed` stays a prop because the two screens genuinely differ there:
 * the gig records a notification commitment on accept, and each pops the
 * screen on its own cancel.
 */
import { TransactionMonitor } from '@/components/feedback'
import { showToast } from '@/components/ui'
import { checkEscrowTransitionApplied, TX_PROGRESS_LABEL } from '@tenda/shared'
import type { EscrowSyncProjection } from '@tenda/shared'
import type { useEscrowActions } from '@/hooks/useEscrowActions'

/** What the monitor needs from the action hook — the hook's own return type. */
type EscrowActions = ReturnType<typeof useEscrowActions>

export function EscrowTransactionMonitor({
  actions,
  escrowId,
  chainId,
  readDetail,
  refresh,
  onConfirmed,
}: {
  actions: EscrowActions
  escrowId: string
  chainId: string
  /** Authoritative projection read — `api.gigs.get` or `api.exchange.get`. */
  readDetail: () => Promise<EscrowSyncProjection>
  /** Re-reads the screen's own copy of the escrow. */
  refresh: () => void
  onConfirmed: () => void
}) {
  return (
    <TransactionMonitor
      signature={actions.pendingTxRef}
      phase={actions.phase}
      actionLabel={
        actions.activeAction !== null ? TX_PROGRESS_LABEL[actions.activeAction] : undefined
      }
      escrowId={escrowId}
      chainId={chainId}
      checkApplied={() => checkEscrowTransitionApplied(actions.pendingAction, readDetail)}
      onConfirmed={onConfirmed}
      onFailed={(msg) => {
        actions.clearPending()
        showToast('info', msg || 'Transaction pending, will sync when confirmed')
        refresh()
      }}
    />
  )
}
