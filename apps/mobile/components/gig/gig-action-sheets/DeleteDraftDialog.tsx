import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/**
 * Draft-delete confirm — the one destructive escrow action that never touches
 * the chain (drafts are pre-sign staging rows, discarded off-chain). Every
 * wallet-opening transition goes through the shared TxConfirmDialog instead.
 */
export function DeleteDraftDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmDialog
      visible={visible}
      title="Delete this draft?"
      message="This action cannot be undone."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
