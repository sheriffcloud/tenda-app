import type { EscrowTxType } from '@tenda/shared'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { txConfirmCopy, type TxConfirmContext } from './copy'

/**
 * Pre-sign confirm gate for a wallet-opening transition. Thin wrapper over the
 * shared ConfirmDialog: it derives the kind-aware copy (effect + amount +
 * "your wallet opens next") from the action, so gig/exchange/post-gig screens
 * only own the `pendingAction` state and the confirm handler. Renders nothing
 * for a null action or one that isn't gated (see txConfirmCopy).
 */
export function TxConfirmDialog({
  action,
  ctx,
  loading = false,
  onConfirm,
  onCancel,
}: {
  action: EscrowTxType | null
  ctx: TxConfirmContext
  /** Spinner on the confirm button while the follow-on tx is being built. */
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const copy = action !== null ? txConfirmCopy(action, ctx) : null
  return (
    <ConfirmDialog
      visible={copy !== null}
      title={copy?.title ?? ''}
      message={copy?.body}
      confirmLabel={copy?.confirmLabel}
      destructive={copy?.destructive ?? false}
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
