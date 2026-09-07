/**
 * One linked wallet: truncated address + chain namespace + primary badge,
 * with the two server-guarded actions. Presentational — the panel owns all
 * API calls and confirmation.
 */
import { truncateWallet, type LinkedWallet } from '@tenda/shared'
import { Button } from '@/components/ui'

interface LinkedWalletRowProps {
  wallet: LinkedWallet
  onSetPrimary: () => void
  onUnlink: () => void
}

export function LinkedWalletRow({ wallet, onSetPrimary, onUnlink }: LinkedWalletRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-numeric text-sm text-content-primary">{truncateWallet(wallet.address)}</span>
        <span className="text-xs text-content-tertiary">
          {wallet.chain_ns === 'solana' ? 'Solana' : 'EVM'}
        </span>
      </div>
      {wallet.is_primary ? (
        <span className="rounded-full bg-brand-primary-surface px-3 py-1 text-xs font-semibold text-brand-primary">
          Primary
        </span>
      ) : (
        <Button variant="ghost" size="md" onClick={onSetPrimary}>
          Make primary
        </Button>
      )}
      <Button variant="ghost" size="md" className="text-feedback-danger-base hover:text-feedback-danger-base" onClick={onUnlink}>
        Unlink
      </Button>
    </li>
  )
}
