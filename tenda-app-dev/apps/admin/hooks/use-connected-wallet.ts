'use client'

/**
 * Live connected wallet address for a chain's namespace, via the WalletSigner
 * seam. `useSyncExternalStore` subscribes to the signer's account changes so a
 * wallet switch re-renders the sign UI immediately (no click, no error). Returns
 * null when there's no signer/chain or nothing is connected.
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { WalletSigner } from '@/lib/resolution-sign'

const NOOP = () => () => {}

export function useConnectedWallet(signer: WalletSigner | null, chainId: string | null): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => (signer === null ? NOOP() : signer.subscribe(onChange)),
    [signer],
  )
  const getSnapshot = useCallback(
    () => (signer === null || chainId === null ? null : signer.getConnected(chainId)),
    [signer, chainId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}
