/**
 * Reown AppKit ↔ imperative-adapter bridge, the React glue half.
 *
 * `<ReownProvider>` mounts once at the app root: it wires AppKit's context, the
 * modal (`<AppKit />`), and a headless `<ReownBridge>` that mirrors the AppKit
 * hooks + modal events into the React-free `connectionSignal`
 * ([[connection-signal]]). The EVM `WalletAdapter` then drives connect/sign
 * imperatively through that signal, see `adapters/walletconnect.ts`.
 *
 * When no Reown project id is configured, this renders children untouched (the
 * WalletConnect adapter reports `isAvailable() === false`, so the picker simply
 * hides the EVM entry, the app still boots).
 */
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import {
  AppKit,
  AppKitProvider,
  useAccount,
  useAppKit,
  useAppKitEventSubscription,
  useProvider,
  useWalletInfo,
} from '@reown/appkit-react-native'
import { appKit, reownConfigured } from './config'
import { connectionSignal } from './connection-signal'

function ReownBridge(): null {
  const { open, disconnect } = useAppKit()
  const { address, isConnected, chainId, namespace } = useAccount()
  const { provider } = useProvider()
  const { walletInfo } = useWalletInfo()

  // Mirror the live AppKit state into the signal on every render, this is what
  // settles an in-flight connect once the account changes. AppKit types
  // `disconnect` as `() => void` but it returns its real `Promise<void>` at
  // runtime; `Promise.resolve` adopts that thenable so the signal can await the
  // actual teardown (no cast, honest `Promise<void>`).
  useEffect(() => {
    connectionSignal.sync({
      open,
      disconnect: () => Promise.resolve(disconnect()),
      provider,
      address,
      isConnected,
      chainId,
      namespace,
      // The connected wallet's own deep link, the adapter opens this to bring
      // the wallet forward for a sign/tx (WC/AppKit-RN won't do it for us).
      peerRedirect: walletInfo?.redirect?.native ?? walletInfo?.redirect?.universal,
    })
  })

  useAppKitEventSubscription('MODAL_CLOSE', (event) => {
    if (event.data.type === 'track' && event.data.event === 'MODAL_CLOSE') {
      connectionSignal.onModalClose(event.data.properties.connected)
    }
  })
  useAppKitEventSubscription('USER_REJECTED', () => {
    connectionSignal.onUserRejected()
  })

  return null
}

export function ReownProvider({ children }: { children: ReactNode }): ReactNode {
  if (!reownConfigured || appKit === null) return children
  return (
    <AppKitProvider instance={appKit}>
      {children}
      <ReownBridge />
      <AppKit />
    </AppKitProvider>
  )
}
