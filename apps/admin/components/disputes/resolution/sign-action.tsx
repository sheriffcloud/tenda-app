'use client'

import { chainNamespaceOf, sameChainAddress } from '@tenda/shared'
import { Button } from '@/components/ui/button'
import { shortenAddress } from '@/lib/utils'
import { useWalletSigner } from '@/providers/wallet-signer'
import { useConnectedWallet } from '@/hooks/use-connected-wallet'
import { useResolutionSign } from '@/hooks/use-resolution-sign'

/**
 * Sign + broadcast a built (executing) resolution. The wallet is gated
 * reactively: the connected address is read live and compared to the chain's
 * configured dispute authority — signing is only enabled once they match, and
 * "Switch wallet" opens the modal so the operator can pick the authority
 * account (the button re-enables the instant they do). The server-built tx is
 * fixed to the reviewed winner, so signing can't change the outcome. Degrades
 * to a notice when no wallet signer is wired on this deployment.
 */
export function SignAction({
  resolutionId,
  chainId,
  authority,
  onSigned,
}: {
  resolutionId: string
  chainId: string
  /** Configured dispute authority for the chain; null skips the match gate. */
  authority: string | null
  onSigned: () => void
}) {
  const signer = useWalletSigner()
  const connected = useConnectedWallet(signer, chainId)
  const { sign, busy } = useResolutionSign(resolutionId, onSigned)

  if (signer === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Wallet signing isn’t configured on this deployment yet.
      </p>
    )
  }

  if (connected === null) {
    return (
      <Button size="sm" onClick={() => void signer.open(chainId)}>
        Connect wallet
      </Button>
    )
  }

  const namespace = chainNamespaceOf(chainId)
  const matches =
    authority === null ||
    (namespace !== undefined && sameChainAddress(namespace, connected, authority))

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Wallet: <span className="font-mono">{shortenAddress(connected)}</span>
      </p>
      {!matches && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Switch to the dispute-authority wallet
          {authority !== null ? ` (${shortenAddress(authority)})` : ''} to sign.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || !matches} onClick={() => void sign(signer)}>
          {busy ? 'Signing…' : 'Sign & resolve'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void signer.open(chainId)}>
          Switch wallet
        </Button>
      </div>
    </div>
  )
}
