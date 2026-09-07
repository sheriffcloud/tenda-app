'use client'

/**
 * "Signing with 0x12…abcd on Base Sepolia · Switch" — the signer preview the
 * TxConfirmDialog mounts above its buttons, so the wallet that is about to
 * open is a fact on screen, not a surprise (a multichain wallet like Phantom
 * can hold the EVM session even when the user thinks of it as Solana).
 * Given a `spend` (a value-moving action), it also warns when THAT wallet
 * positively holds less of the asset than the action debits — the moment the
 * user can still switch or top up, instead of after the revert.
 * All behaviour lives in useSigningWallet/useSignerBalance; this renders it.
 * Every sentence is SHARED with mobile's row — this is the one place a reader
 * is told which wallet is about to open, and two wordings would be two
 * products.
 */
import {
  chainLabel,
  formatAssetAmount,
  SIGNING_WALLET_COPY,
  truncateWallet,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { useSigningWallet } from '@/hooks/wallet/useSigningWallet'
import { useSignerBalance, type SpendPreview } from '@/hooks/wallet/useSignerBalance'

export function SigningWalletRow({
  chainId,
  spend,
  bound,
}: {
  chainId: string
  spend?: SpendPreview
  /**
   * The chain-bound signer for this transition (the detail wire's
   * `my_signer_address`), when the escrow already fixed one. The preview
   * shows it instead of the free session-or-primary resolution, and the
   * affordance becomes "Connect" — a targeted connect to that exact wallet,
   * the only one the chain will accept.
   */
  bound?: string | null
}) {
  const signer = useSigningWallet(chainId, bound ?? null)
  const balance = useSignerBalance(chainId, spend ?? null, signer.address)
  if (signer.namespace === null) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-card px-3 py-1.5">
        <p className="type-body-small text-content-secondary">
          {SIGNING_WALLET_COPY.prefix}{' '}
          <span className="font-numeric font-semibold text-content-primary">
            {signer.address !== null
              ? truncateWallet(signer.address)
              : SIGNING_WALLET_COPY.noWallet}
          </span>{' '}
          {SIGNING_WALLET_COPY.chainSuffix(chainLabel(chainId))}
        </p>
        <Button
          variant="ghost"
          size="md"
          disabled={signer.switching}
          onClick={() => void signer.switchWallet()}
        >
          {signer.switching
            ? SIGNING_WALLET_COPY.waiting
            : signer.bound
              ? SIGNING_WALLET_COPY.connectAction
              : SIGNING_WALLET_COPY.switchAction}
        </Button>
      </div>
      {spend !== undefined && balance.funds === 'short' && balance.availableRaw !== null && (
        <p role="alert" className="type-body-small text-feedback-danger-text">
          {SIGNING_WALLET_COPY.shortFunds(
            formatAssetAmount(balance.availableRaw, spend.assetId),
            formatAssetAmount(spend.amountRaw, spend.assetId),
          )}
        </p>
      )}
      {signer.error !== null && (
        <p role="alert" className="type-body-small text-feedback-danger-text">
          {signer.error}
        </p>
      )}
    </div>
  )
}
