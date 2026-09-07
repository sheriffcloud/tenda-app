/**
 * Reown AppKit ↔ imperative-adapter bridge, the React-FREE half.
 *
 * AppKit's public API is hook-based (`useAppKit`/`useAccount`/`useProvider`),
 * but our `WalletAdapter` seam is imperative (`auth.ts` calls
 * `adapter.authenticate()`, `dispatch.ts` calls `sendEvmTransaction()`). This
 * module is the seam: a small state machine the `<ReownBridge>` component feeds
 * fresh hook values + modal events into (`sync`/`onModalClose`/`onUserRejected`),
 * and the adapter drives imperatively (`connect`/`disconnect`/`getProvider`).
 *
 * Keeping it React-free makes it fully unit-testable without rendering AppKit,
 * and keeps the native-heavy `bridge.tsx` a thin glue shell.
 */
import { WalletError } from '@/wallet/errors'
import { WALLET_CHAINS } from '../config'
import type { SpikeAccount } from '../types'

/**
 * Minimal structural view of the AppKit EVM provider, only the `request`
 * method we use. The real `useProvider().provider` is assignable to this, so we
 * avoid importing AppKit's `Provider` type (a transitive package) or casting.
 */
export interface EvmRequestProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] }, chain?: string): Promise<T>
}

/** The live AppKit state the bridge mirrors in on every render. */
export interface ReownLiveState {
  open: () => void
  /**
   * End the active session. Resolves when AppKit has actually torn the session
   * down, we await this promise directly rather than waiting for a follow-up
   * `sync` to report `isConnected === false` (that re-render can lag or never
   * arrive, which previously hung wallet-linking / the old login forceFresh).
   */
  disconnect: () => Promise<void>
  provider: EvmRequestProvider | undefined
  address: string | undefined
  namespace: string | undefined
  chainId: string | undefined
  isConnected: boolean
  /**
   * The CONNECTED WALLET's own deep link (`redirect.native` ?? `.universal`,
   * from AppKit `useWalletInfo`). Used to foreground the wallet when we send it
   * a sign / tx request, WC/AppKit-RN does not auto-reopen the wallet for a
   * session request in this setup, so the adapter opens this itself.
   */
  peerRedirect: string | undefined
}

/** CAIP-2 chain id for the active account, falls back to our primary EVM chain. */
function caipChainId(namespace: string | undefined, chainId: string | undefined): string {
  if (chainId === undefined || chainId === '') return WALLET_CHAINS.eip155
  if (chainId.includes(':')) return chainId
  return `${namespace ?? 'eip155'}:${chainId}`
}

function toAccount(state: ReownLiveState): SpikeAccount {
  return {
    namespace: 'eip155',
    chainId: caipChainId(state.namespace, state.chainId),
    address: state.address ?? '',
    walletId: 'walletconnect',
  }
}

/**
 * Promise-based connection coordinator. A single in-flight connect or
 * disconnect at a time (the picker already guards double-taps); a user-decline
 * surfaces as `WalletError('declined')` so `connectThenSign` maps it to `null`.
 */
export class ConnectionSignal {
  private live: ReownLiveState | null = null
  private pendingConnect: {
    resolve: (account: SpikeAccount) => void
    reject: (err: Error) => void
  } | null = null

  /**
   * Mirror the latest AppKit hook values. Settles any in-flight connect once an
   * account is populated. (Disconnect resolves off AppKit's own promise, see
   * `disconnect()`, so it needs no settle here.)
   */
  sync(state: ReownLiveState): void {
    this.live = state
    if (this.pendingConnect !== null && state.isConnected && state.address) {
      const { resolve } = this.pendingConnect
      this.pendingConnect = null
      resolve(toAccount(state))
    }
  }

  /** AppKit modal dismissed. `connected === false` ⇒ the user closed it without connecting. */
  onModalClose(connected: boolean): void {
    if (this.pendingConnect !== null && !connected) this.rejectConnect('Wallet connection cancelled')
  }

  /** The wallet/user explicitly rejected the connection request. */
  onUserRejected(): void {
    this.rejectConnect('Wallet request rejected')
  }

  private rejectConnect(message: string): void {
    if (this.pendingConnect === null) return
    const { reject } = this.pendingConnect
    this.pendingConnect = null
    reject(new WalletError('declined', message))
  }

  /**
   * Open the AppKit modal and resolve with the account once connected.
   *
   * `fresh` (wallet-linking) skips the already-connected fast path so the modal
   * always opens, letting the user pick a DIFFERENT wallet than the one on
   * their JWT. Without it, a just-disconnected-but-not-yet-re-synced session
   * would short-circuit back to the same account.
   */
  connect(opts?: { fresh?: boolean }): Promise<SpikeAccount> {
    const live = this.live
    if (live === null) {
      return Promise.reject(new WalletError('network', 'Wallet bridge is not ready yet'))
    }
    if (!opts?.fresh && live.isConnected && live.address) return Promise.resolve(toAccount(live))
    if (this.pendingConnect !== null) {
      return Promise.reject(new WalletError('unknown', 'A wallet connection is already in progress'))
    }
    return new Promise<SpikeAccount>((resolve, reject) => {
      this.pendingConnect = { resolve, reject }
      live.open()
    })
  }

  /**
   * End the active session. Resolves off AppKit's own `disconnect()` promise so
   * it settles deterministically (the previous re-render wait could hang the
   * caller, the forceFresh link path awaits this before re-opening the modal).
   */
  disconnect(): Promise<void> {
    const live = this.live
    if (live === null || !live.isConnected) return Promise.resolve()
    return live.disconnect()
  }

  /** The live EVM provider, or `undefined` when no session is active. */
  getProvider(): EvmRequestProvider | undefined {
    return this.live?.provider
  }

  /** The connected wallet's deep link, for foregrounding it on a request. */
  getPeerRedirect(): string | undefined {
    return this.live?.peerRedirect
  }

  /** The connected account, or `null` when not connected. */
  getAccount(): SpikeAccount | null {
    const live = this.live
    return live !== null && live.isConnected && live.address ? toAccount(live) : null
  }
}

export const connectionSignal = new ConnectionSignal()
