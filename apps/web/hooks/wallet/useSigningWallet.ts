'use client'

/**
 * The wallet a transaction on `chainId` will sign with, plus the "Switch
 * wallet" action — the reusable unit behind the confirm dialog's signer row.
 *
 * FREE transitions (create, public accept): the address is the SAME
 * resolution dispatch declares to the server (session-if-linked, else
 * primary), so what the dialog previews is what actually signs; Switch rides
 * `switchToLinkedWallet` (any linked wallet, fresh pick, stranger refused by
 * name).
 *
 * BOUND transitions: `bound` (the detail wire's chain-attested
 * `my_signer_address`) overrides the preview — the chain fixed the signer, so
 * showing session-or-primary would be a lie — and Switch becomes the TARGETED
 * connect (`connectAsWallet`): it can only succeed as that wallet, which is
 * also what pre-arms the session so dispatch's guard passes untouched.
 * A dismissal is a change of mind either way, not an error.
 */
import { useCallback, useEffect, useReducer, useState } from 'react'
import { SIGNING_WALLET_COPY, WalletError, findChain, pickWalletAddress } from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared'
import { sessionAddressFor } from '@/wallet/dispatch'
import { connectAsWallet, switchToLinkedWallet } from '@/wallet/send'
import { useAuthStore } from '@/stores/auth.store'

export interface SigningWallet {
  namespace: ChainNamespace | null
  /** The bound wallet when given, else the most-likely signer; null when
   *  nothing is linked (or, bound-less, nothing resolvable). */
  address: string | null
  /** True when `address` is the chain-bound signer (no free choice exists). */
  bound: boolean
  switching: boolean
  /** A failed switch/connect (stranger pick / load failure); null otherwise. */
  error: string | null
  switchWallet: () => Promise<void>
}

export function useSigningWallet(chainId: string, bound?: string | null): SigningWallet {
  const ns = findChain(chainId)?.namespace ?? null
  const required = bound ?? null
  const wallets = useAuthStore((s) => s.wallets)
  const ensureWallets = useAuthStore((s) => s.ensureWallets)
  // The live session is not reactive (the modal owns it) — re-read after a
  // switch settles; the wallets subscription covers trust-list changes.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void ensureWallets()
  }, [ensureWallets])

  const switchWallet = useCallback(async () => {
    if (ns === null || switching) return
    setSwitching(true)
    setError(null)
    try {
      if (required !== null) {
        await connectAsWallet(ns, required)
      } else {
        await switchToLinkedWallet(ns)
      }
    } catch (e) {
      if (!(e instanceof WalletError && e.code === 'declined')) {
        setError(e instanceof Error ? e.message : SIGNING_WALLET_COPY.switchFailed)
      }
    } finally {
      setSwitching(false)
      rerender()
    }
  }, [ns, required, switching])

  return {
    namespace: ns,
    address:
      ns === null ? null : (required ?? pickWalletAddress(ns, sessionAddressFor(ns), wallets)),
    bound: ns !== null && required !== null,
    switching,
    error,
    switchWallet,
  }
}
