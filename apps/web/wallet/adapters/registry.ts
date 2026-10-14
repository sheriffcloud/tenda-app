/**
 * Adapter registry (port of apps/mobile/wallet/adapters/registry.ts). One
 * entry today — AppKit's modal is itself the multi-wallet picker on web — but
 * the seam is the point: a future transport (e.g. a browser-extension-direct
 * adapter) registers here and nothing else changes.
 */
import { reownAdapter } from './reown'
import type { WalletAdapter } from './types'

export const adapters: readonly WalletAdapter[] = [reownAdapter]

export function findAdapter(id: string): WalletAdapter | undefined {
  return adapters.find((a) => a.id === id)
}

export function requireAdapter(id: string): WalletAdapter {
  const adapter = findAdapter(id)
  if (!adapter) throw new Error(`No adapter registered for wallet "${id}"`)
  return adapter
}
