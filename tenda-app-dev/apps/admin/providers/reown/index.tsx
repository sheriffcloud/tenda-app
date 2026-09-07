'use client'

/**
 * Mounts the already client-loaded Reown AppKit runtime and feeds its concrete
 * signer into the wallet-signer seam. Initialization runs after render so
 * custom elements and modal DOM can never mutate a hydration pass.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'
import { WalletSignerProvider } from '@/providers/wallet-signer'
import type { WalletSigner } from '@/lib/resolution-sign'
import { initReown, type ReownRuntime } from './config'
import { createReownSigner } from './signer'
import type { ReownEnvironment } from './env'

interface Mounted {
  runtime: ReownRuntime
  signer: WalletSigner
}

export function ReownProvider({
  environment,
  children,
}: {
  environment: Extract<ReownEnvironment, { enabled: true }>
  children: ReactNode
}) {
  const [mounted, setMounted] = useState<Mounted | null>(null)
  const initializationStarted = useRef(false)

  useEffect(() => {
    if (initializationStarted.current) return
    initializationStarted.current = true
    let alive = true
    void Promise.resolve().then(() => {
      if (!alive) return
      try {
        const runtime = initReown(environment.projectId, environment.adminUrl)
        setMounted({ runtime, signer: createReownSigner(runtime.modal, runtime.wagmiConfig) })
      } catch (error) {
        // Wallet failure must not take down the moderation dashboard. SignAction
        // remains in its explicit "not configured" state.
        console.error('[reown] runtime failed to initialize:', error)
      }
    })
    return () => {
      alive = false
      initializationStarted.current = false
    }
  }, [environment.adminUrl, environment.projectId])

  if (mounted === null) {
    return <WalletSignerProvider signer={null}>{children}</WalletSignerProvider>
  }

  return (
    <WagmiProvider config={mounted.runtime.wagmiConfig}>
      <QueryClientProvider client={mounted.runtime.queryClient}>
        <WalletSignerProvider signer={mounted.signer}>{children}</WalletSignerProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
