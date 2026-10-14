/**
 * The wallet a transaction on `chainId` will sign with, plus the change-wallet
 * action — the reusable unit behind the signer row.
 *
 * FREE transitions (create, publish, public accept): the address is the SAME
 * resolution dispatch declares to the server — `pickWalletAddress` over
 * `signerSessionAddress`, the SHARED input in `signer-slot` (live session
 * first, store slot second). Sharing that module is the point: a second copy
 * is how a preview starts naming a different wallet than the one that opens.
 *
 * BOUND transitions: `bound` (the detail wire's chain-attested
 * `my_signer_address`) overrides the preview — the chain fixed the signer, so
 * showing session-or-primary would be a lie — and the action becomes a
 * TARGETED connect that can only succeed as that wallet.
 *
 * Mobile's transports are per-wallet-app, so the ADAPTER is the caller's to
 * supply (the existing WalletPicker); a dismissal is a change of mind either
 * way, not an error.
 */
import { useCallback, useEffect, useState } from 'react'
import { SIGNING_WALLET_COPY, WalletError, findChain, pickWalletAddress } from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared'
import { signerSessionAddress } from '@/wallet/signer-slot'
import { switchSignerWith } from '@/wallet/switch-signer'
import { useAuthStore } from '@/stores/auth.store'
import type { WalletAdapter } from '@/wallet/adapters/types'

export interface SigningWallet {
  namespace: ChainNamespace | null
  /** The bound wallet when given, else the most-likely signer; null when
   *  nothing is linked (or, bound-less, nothing resolvable). */
  address: string | null
  /** True when `address` is the chain-bound signer (no free choice exists). */
  bound: boolean
  switching: boolean
  /** A failed switch (stranger pick, or not the wallet the escrow needs). */
  error: string | null
  /** Adopt `adapter`'s account as this device's signer on this chain. */
  switchWith: (adapter: WalletAdapter) => Promise<void>
}

export function useSigningWallet(chainId: string, bound?: string | null): SigningWallet {
  const ns = findChain(chainId)?.namespace ?? null
  const required = bound ?? null
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshMe = useAuthStore((s) => s.refreshMe)

  // The preview reads `wallets[]`, so a list that never loaded would answer
  // "no linked wallet" — the exact misleading answer this row exists to
  // prevent. Read the status imperatively and keep it OUT of the deps:
  // `refreshMe` moves it to `loading` and then to `ready`/`error`, so a
  // status-dependent effect would re-fire on each and re-request forever after
  // a failure. Once per mount; the row's Switch is the deliberate retry.
  useEffect(() => {
    if (useAuthStore.getState().walletsStatus !== 'ready') void refreshMe()
  }, [refreshMe])

  // Three primitive subscriptions rather than one object selector: a
  // `refreshMe` landing while the sheet is open has to move the preview, and
  // the switch below writes the slot this reads — but an object selector would
  // allocate a new value every render and re-render forever.
  const wallets = useAuthStore((s) => s.wallets)
  const evmAddress = useAuthStore((s) => s.evmAddress)
  const walletAddress = useAuthStore((s) => s.walletAddress)
  const resolved =
    ns === null
      ? null
      : pickWalletAddress(ns, signerSessionAddress({ evmAddress, walletAddress }, ns), wallets)

  const switchWith = useCallback(
    async (adapter: WalletAdapter) => {
      if (ns === null || switching) return
      setSwitching(true)
      setError(null)
      try {
        await switchSignerWith(adapter, ns, required)
      } catch (e) {
        // Closing the wallet is a change of mind, not a failure to report.
        if (!(e instanceof WalletError && e.code === 'declined')) {
          setError(e instanceof Error ? e.message : SIGNING_WALLET_COPY.switchFailed)
        }
      } finally {
        setSwitching(false)
      }
    },
    [ns, required, switching],
  )

  return {
    namespace: ns,
    address: ns === null ? null : (required ?? resolved),
    bound: ns !== null && required !== null,
    switching,
    error,
    switchWith,
  }
}
