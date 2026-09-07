'use client'

/**
 * Wallet-signer seam (Issue-3 C2). The concrete dual-chain signer (Reown
 * AppKit) plugs in here at the app root; until it does, the context is null
 * and the sign UI degrades to "not configured". Keeping the seam here means
 * the whole sign flow is testable without any wallet library.
 */

import { createContext, useContext } from 'react'
import type { WalletSigner } from '@/lib/resolution-sign'

const WalletSignerContext = createContext<WalletSigner | null>(null)

export function useWalletSigner(): WalletSigner | null {
  return useContext(WalletSignerContext)
}

export function WalletSignerProvider({
  signer,
  children,
}: {
  signer: WalletSigner | null
  children: React.ReactNode
}) {
  return <WalletSignerContext.Provider value={signer}>{children}</WalletSignerContext.Provider>
}
