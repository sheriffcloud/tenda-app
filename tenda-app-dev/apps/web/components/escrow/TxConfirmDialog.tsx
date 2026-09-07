'use client'

/**
 * Pre-sign confirm gate for a wallet-opening transition (port of mobile's
 * components/escrow/tx-action/TxConfirmDialog). Thin wrapper over the shared
 * ConfirmDialog: it derives the kind-aware copy (effect + amount + "your
 * wallet opens next") from the action via the shared copy table, so screens
 * only own the `pendingAction` state and the confirm handler. Renders
 * nothing for a null action or one that isn't gated (see txConfirmCopy).
 */
import { txConfirmCopy, type EscrowTxType, type TxConfirmContext } from '@tenda/shared'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'
import { SigningWalletRow } from '@/components/wallet/SigningWalletRow'
import type { SpendPreview } from '@/hooks/wallet/useSignerBalance'

export function TxConfirmDialog({
  action,
  ctx,
  chainId,
  spend,
  boundSigner,
  loading = false,
  onConfirm,
  onCancel,
}: {
  action: EscrowTxType | null
  ctx: TxConfirmContext
  /**
   * The escrow's chain. When given, the dialog previews the wallet that will
   * sign ("Signing with 0x… on Base Sepolia") with a Switch affordance — the
   * wallet that opens next is a fact on screen, not a surprise.
   */
  chainId?: string
  /**
   * What confirming will DEBIT from the signing wallet, in base units of the
   * escrow's asset. Pass only for value-moving actions — today 'create'
   * (fund a gig / publish an offer); dispute bonds ride their own sheet.
   * With it, the signer row warns when the previewed wallet positively holds
   * less than the debit.
   */
  spend?: SpendPreview
  /**
   * The chain-attested wallet this escrow binds THIS VIEWER to (the detail
   * wire's `my_signer_address`). With it the signer row previews the wallet
   * the transition actually requires — not the free session-or-primary guess
   * — and its affordance pre-connects that exact wallet. Null/absent = no
   * binding recorded (create, public accept, pre-column escrows).
   */
  boundSigner?: string | null
  /** Busy state on the confirm button while the follow-on tx is being built. */
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const copy = action !== null ? txConfirmCopy(action, ctx) : null
  return (
    <ConfirmDialog
      open={copy !== null}
      title={copy?.title ?? ''}
      message={copy?.body}
      {...(chainId !== undefined
        ? {
            extra: (
              <SigningWalletRow
                chainId={chainId}
                {...(spend !== undefined ? { spend } : {})}
                {...(boundSigner !== undefined ? { bound: boundSigner } : {})}
              />
            ),
          }
        : {})}
      confirmLabel={copy?.confirmLabel ?? ''}
      destructive={copy?.destructive ?? false}
      busy={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
