'use client'

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { WalletSignerProvider } from '@/providers/wallet-signer'
import { reownEnvironment, type ReownEnvironment } from './env'

type RuntimeProvider = ComponentType<{
  environment: Extract<ReownEnvironment, { enabled: true }>
  children: ReactNode
}>

/**
 * The only static dependency of this boundary is the lightweight signer
 * context. SSR and the first browser render are therefore identical. Wallet
 * libraries enter the graph after mount and only where signing is rendered.
 */
export function ReownBoundary({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<RuntimeProvider | null>(null)
  const [environment, setEnvironment] = useState<Extract<ReownEnvironment, { enabled: true }> | null>(null)

  useEffect(() => {
    let alive = true
    let configured: ReownEnvironment
    try {
      configured = reownEnvironment()
    } catch (error) {
      console.error('[reown] invalid configuration:', error)
      return
    }
    if (!configured.enabled) return

    void import('./index').then(
      ({ ReownProvider }) => {
        if (!alive) return
        setEnvironment(configured)
        setRuntime(() => ReownProvider)
      },
      (error: unknown) => {
        console.error('[reown] runtime failed to load:', error)
      },
    )

    return () => {
      alive = false
    }
  }, [])

  if (runtime === null || environment === null) {
    return <WalletSignerProvider signer={null}>{children}</WalletSignerProvider>
  }

  const Runtime = runtime
  return <Runtime environment={environment}>{children}</Runtime>
}
