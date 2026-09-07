import { txConfirmCopy, type EscrowTxType, type TxConfirmContext } from '@tenda/shared'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SigningWalletRow } from '@/components/wallet/SigningWalletRow'

/**
 * Pre-sign confirm gate for a wallet-opening transition. Thin wrapper over the
 * shared ConfirmDialog: it derives the kind-aware copy (effect + amount +
 * "your wallet opens next") from the action, so gig/exchange/post-gig screens
 * only own the `pendingAction` state and the confirm handler. Renders nothing
 * for a null action or one that isn't gated (see txConfirmCopy).
 *
 * With `chainId` it also previews WHICH wallet opens next. That sentence is
 * the point of the gate: "your wallet opens next" is not much use when the
 * reader holds several and the escrow may already be bound to one of them.
 */
export function TxConfirmDialog({
  action,
  ctx,
  chainId,
  boundSigner,
  loading = false,
  onConfirm,
  onCancel,
}: {
  action: EscrowTxType | null
  ctx: TxConfirmContext
  /**
   * The escrow's chain. When given, the dialog previews the signing wallet
   * ("Signing with 0x… on Base Sepolia") with a Switch affordance.
   */
  chainId?: string
  /**
   * The chain-attested wallet this escrow binds THIS VIEWER to (the detail
   * wire's `my_signer_address`). With it the row previews the wallet the
   * transition actually requires — not the free session-or-primary guess —
   * and its affordance connects that exact wallet. Null/absent = no binding
   * recorded (create, public accept, escrows that predate the columns).
   */
  boundSigner?: string | null
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
      {...(chainId !== undefined
        ? {
            extra: (
              <SigningWalletRow
                chainId={chainId}
                {...(boundSigner !== undefined ? { bound: boundSigner } : {})}
              />
            ),
          }
        : {})}
      confirmLabel={copy?.confirmLabel}
      destructive={copy?.destructive ?? false}
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
