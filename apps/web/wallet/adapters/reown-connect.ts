/**
 * Imperative connect-wait over the AppKit modal — web's analogue of mobile's
 * `ConnectionSignal`. On web AppKit exposes `subscribeAccount`/`subscribeState`
 * directly on the modal instance (no React bridge needed), so "connect" is:
 * open the modal, resolve on the first connected account the options accept
 * (any namespace by default; only the target one when a tx flow names it, and
 * only a post-open choice in `fresh` mode — see `ConnectOptions`), and treat
 * a close-without-account as a user decline (typed `WalletError('declined')`,
 * which `connectThenSign` maps to `null`).
 */
import { WalletError } from '@tenda/shared'
import type { ChainNamespace, WalletAccount } from '@tenda/shared'
import { WALLET_CHAINS } from '../config'

export const REOWN_WALLET_ID = 'reown'

/**
 * Budget for the modal to APPEAR (open() awaits an untimed AppKit prefetch —
 * verified: no signal/timeout anywhere in its ApiController — so a black-holed
 * network would otherwise strand "Waiting for wallet…" forever). Generous,
 * because it only covers the opening phase: once the modal is open the user's
 * decision time is deliberately unbounded. Same failure class as mobile's
 * WC request guard, scoped to web's one pre-UI await.
 */
export const MODAL_OPEN_TIMEOUT_MS = 30_000

/**
 * Minimal structural view of the AppKit modal — only what connecting needs.
 * The real `AppKit` instance is assignable to this (same pattern as mobile's
 * `EvmRequestProvider`: no AppKit type import, no casting, and tests fake it
 * without `unknown` gymnastics).
 */
export interface ConnectModal {
  getAddress(namespace: ChainNamespace): string | undefined
  /**
   * Per-namespace connection lifecycle — 'connecting'/'reconnecting' means a
   * persisted session is still being RESTORED, so "no address yet" is not
   * "no session" (mobile's tri-state doctrine). Undefined until the
   * namespace's state exists.
   */
  getAccount(
    namespace: ChainNamespace,
  ): { status?: 'reconnecting' | 'connected' | 'disconnected' | 'connecting' } | undefined
  getCaipNetwork(namespace: ChainNamespace): { caipNetworkId?: string } | undefined
  subscribeAccount(callback: () => void, namespace: ChainNamespace): () => void
  subscribeState(callback: (state: { open: boolean }) => void): () => void
  close(): Promise<unknown>
  /**
   * AppKit resolves open() with transport-specific extras we never read.
   * `namespace` filters the wallet list to one chain namespace
   * (ConnectorController.setFilterByNamespace — source-verified); `view`
   * forces the connect list even when a session survived a failed disconnect.
   */
  open(options?: { view?: 'Connect'; namespace?: ChainNamespace }): Promise<unknown>
}

/** What a connect wait accepts — see `waitForConnection`. */
export interface ConnectOptions {
  /**
   * Resolve ONLY on an account in this namespace, and filter the modal's
   * wallet list to it. Without it any namespace wins (sign-in / linking,
   * where the user decides which wallet — and which chain family — to use).
   */
  namespace?: ChainNamespace
  /**
   * The account must be one the user actively connects AFTER the modal is
   * presented. A session that already existed — or that wagmi's auto-
   * reconnect silently restored while the modal was opening — is NOT the
   * user's choice: accepting it is what raced a personal_sign prompt against
   * the still-open wallet list during linking.
   */
  fresh?: boolean
}

const NAMESPACES: readonly ChainNamespace[] = ['solana', 'eip155']

/** CAIP-2 id of the namespace's active network, falling back to our canonical chain. */
function caipChainIdOf(modal: ConnectModal, namespace: ChainNamespace): string {
  const id = modal.getCaipNetwork(namespace)?.caipNetworkId
  return typeof id === 'string' && id.includes(':') ? id : WALLET_CHAINS[namespace]
}

/**
 * The connected account, or null. Unfiltered, Solana wins ties (primary
 * rail); with `namespace`, only that namespace counts — a live session on the
 * OTHER namespace must never satisfy a namespace-targeted wait.
 */
export function connectedAccount(
  modal: ConnectModal,
  namespace?: ChainNamespace,
): WalletAccount | null {
  for (const ns of namespace !== undefined ? [namespace] : NAMESPACES) {
    const address = modal.getAddress(ns)
    if (address !== undefined && address !== '') {
      return { namespace: ns, chainId: caipChainIdOf(modal, ns), address, walletId: REOWN_WALLET_ID }
    }
  }
  return null
}

/**
 * Budget for a just-booted adapter to finish restoring a persisted session.
 * Normally settles in milliseconds (a 'disconnected' status short-circuits);
 * the cap only bounds a wedged restore so the connect modal still opens.
 */
export const SESSION_RESTORE_TIMEOUT_MS = 3_000

/**
 * The connected account once any in-flight session RESTORE has settled, or
 * null when the namespace(s) are conclusively disconnected. The runtime boots
 * lazily, so the first wallet action of a session reads `getAddress` while
 * the adapter is still restoring a persisted Phantom/MetaMask session —
 * treating that as "not connected" opened the connect modal at the user who
 * HAD a session, and the restore then resolved the wait and raced the signing
 * prompt against the still-open wallet list. Ask this first; open the modal
 * only when it answers null.
 */
export function settledConnectedAccount(
  modal: ConnectModal,
  namespace?: ChainNamespace,
): Promise<WalletAccount | null> {
  const existing = connectedAccount(modal, namespace)
  if (existing !== null) return Promise.resolve(existing)
  const namespaces = namespace !== undefined ? [namespace] : NAMESPACES
  const allDisconnected = () =>
    namespaces.every((ns) => modal.getAccount(ns)?.status === 'disconnected')
  if (allDisconnected()) return Promise.resolve(null)

  return new Promise<WalletAccount | null>((resolve) => {
    let settled = false
    const unsubscribes: Array<() => void> = []
    const finish = (value: WalletAccount | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      for (const unsubscribe of unsubscribes) unsubscribe()
      resolve(value)
    }
    const timer = setTimeout(
      () => finish(connectedAccount(modal, namespace)),
      SESSION_RESTORE_TIMEOUT_MS,
    )
    for (const ns of namespaces) {
      unsubscribes.push(
        modal.subscribeAccount(() => {
          const account = connectedAccount(modal, namespace)
          if (account !== null) finish(account)
          else if (allDisconnected()) finish(null)
        }, ns),
      )
    }
  })
}

/**
 * Open the modal and settle on connect or dismissal. Two subtleties, both
 * verified against AppKit's source:
 *
 *  - The close handler re-checks for an account before declaring a decline —
 *    several wallets close the modal in the same tick the account lands.
 *  - `open: false` only means "dismissed" once the modal has actually BEEN
 *    open. AppKit's state proxy also mutates for loading/init changes while
 *    `open()` is still working (it awaits a prefetch, then sets
 *    `loading: true` BEFORE `open: true`), and valtio notifies subscribers
 *    on every one of those — without the `modalWasOpen` gate, that pre-open
 *    `loading` event read as an instant user decline.
 */
export function waitForConnection(
  modal: ConnectModal,
  opts?: ConnectOptions,
): Promise<WalletAccount> {
  return new Promise<WalletAccount>((resolve, reject) => {
    let settled = false
    let modalWasOpen = false
    const unsubscribes: Array<() => void> = []
    // Fires only if the modal never OPENED within the budget; an open modal
    // waits on the user indefinitely (the callback checks modalWasOpen).
    const openTimer = setTimeout(() => {
      if (!modalWasOpen) {
        finish(() =>
          reject(
            new WalletError('timeout', 'The wallet dialog did not open — check your connection and try again'),
          ),
        )
      }
    }, MODAL_OPEN_TIMEOUT_MS)
    function finish(settleFn: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(openTimer)
      for (const unsubscribe of unsubscribes) unsubscribe()
      settleFn()
    }

    for (const namespace of opts?.namespace !== undefined ? [opts.namespace] : NAMESPACES) {
      unsubscribes.push(
        modal.subscribeAccount(() => {
          // fresh: an account event BEFORE the modal is presented is a
          // restored session, not the user's choice — ignore it and let the
          // list open. (Residual accepted: a restore completing while the
          // modal is already up still counts; the modal shows it connected,
          // and the sign prompt that follows remains rejectable.)
          if (opts?.fresh === true && !modalWasOpen) return
          const account = connectedAccount(modal, opts?.namespace)
          if (account !== null) {
            finish(() => {
              // A connect via AppKit's own list closes the modal itself, but a
              // session landing from elsewhere (late restore) does not — and
              // the flow moves on to a SIGNING prompt, which must not compete
              // with a lingering wallet list. Idempotent when already closed.
              void modal.close().catch(() => {})
              resolve(account)
            })
          }
        }, namespace),
      )
    }
    unsubscribes.push(
      modal.subscribeState((state) => {
        if (state.open) {
          modalWasOpen = true
          return
        }
        if (!modalWasOpen) return // pre-open loading/init churn, not a dismissal
        const account = connectedAccount(modal, opts?.namespace)
        if (account !== null) finish(() => resolve(account))
        else finish(() => reject(new WalletError('declined', 'Wallet connection cancelled')))
      }),
    )

    // Always the Connect view (a session surviving a failed disconnect would
    // otherwise open on the Account view); the namespace filters the wallet
    // list to the chain family the flow can actually use.
    modal
      .open({ view: 'Connect', ...(opts?.namespace !== undefined ? { namespace: opts.namespace } : {}) })
      .then(
        () => {
          // open() resolving means the modal was presented — even if the
          // open:true event raced past the subscription above, later close
          // events must count as real dismissals.
          modalWasOpen = true
        },
        (cause: unknown) => {
          finish(() => reject(new WalletError('unknown', 'Could not open the wallet modal', cause)))
        },
      )
  })
}
