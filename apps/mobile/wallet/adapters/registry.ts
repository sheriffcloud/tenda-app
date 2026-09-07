import { walletConnectAdapter } from './walletconnect'
import { phantomAdapter } from './phantom'
import { solanaMwaAdapter } from './solana-mwa'
import type { WalletAdapter } from './types'

/**
 * Picker display order. Per-platform availability is enforced by each
 * adapter's `isAvailable()` so the picker shows only entries with a real
 * transport on the current device:
 *
 *   • EVM     → WalletConnect (Reown AppKit), one entry, AppKit's modal lists
 *               every WC v2 wallet (MetaMask, Trust, Rainbow, SafePal…). Hidden
 *               when no Reown project id is configured.
 *   • Android → Solana Wallet (MWA, OS picks Phantom/Solflare/etc.)
 *   • iOS     → Phantom (universal links)
 *
 * The split mirrors the actual transport landscape: WC is wallet-agnostic by
 * design; MWA on Android is too (no targeting API); but iOS Solana uses each
 * wallet's own universal-link protocol, so iOS gets per-wallet Solana entries.
 */
export const adapters: readonly WalletAdapter[] = [
  walletConnectAdapter,
  solanaMwaAdapter,
  phantomAdapter,
]

export function findAdapter(id: string): WalletAdapter | undefined {
  return adapters.find((a) => a.id === id)
}

export function requireAdapter(id: string): WalletAdapter {
  const adapter = findAdapter(id)
  if (!adapter) throw new Error(`No adapter registered for wallet "${id}"`)
  return adapter
}
