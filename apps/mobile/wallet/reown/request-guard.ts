/**
 * Guarded WalletConnect requests: the un-hang seam for every WC session
 * request (personal_sign / eth_sendTransaction / eth_signTypedData_v4).
 *
 * WC responses ride a cloud relay websocket. When Tenda is backgrounded while
 * the wallet is up, that socket can drop and the wallet's response is lost —
 * the `provider.request` promise then NEVER settles, which used to freeze the
 * signing modal until the app was killed. The guard races every request
 * against a timeout and a user-driven abort (the modal's Cancel button), so
 * silence becomes a typed `WalletError` instead of a hang.
 *
 * Session hygiene: WC v2 has no way to retract a published request, and a
 * stale queued request wedges some wallets (every later tx simulates against
 * the old calldata and "reverts"). Dropping the session is the only reliable
 * cleanup, so BOTH exits disconnect best-effort; reconnect is one tap via the
 * connect-on-demand guard (ensureEvmSession).
 *
 * The in-flight registry is subscribable (useSyncExternalStore-compatible) so
 * UI can offer Cancel exactly while an abortable request exists — never a
 * dead button on the Solana/MWA path, which doesn't route through here.
 */
import { WalletError } from '@/wallet/errors'
import { connectionSignal } from './connection-signal'

/**
 * Unattended backstop. Wallet-side WC requests expire after ~5 min anyway, so
 * waiting longer can never succeed; 3 min keeps the recovery ahead of that
 * while leaving room for a slow human approval. Cancel is the active exit.
 */
export const WC_REQUEST_TIMEOUT_MS = 180_000

/**
 * Cap on the best-effort disconnect: it publishes over the same relay that
 * just went silent, so it must never block the user-facing rejection.
 */
export const WC_DISCONNECT_CAP_MS = 5_000

export const WC_TIMEOUT_MESSAGE =
  'Your wallet did not respond. If you approved the transaction there, it will sync automatically once it confirms.'
export const WC_CANCELLED_MESSAGE = 'Transaction cancelled.'

type Aborter = () => void

const inFlight = new Set<Aborter>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Subscribe to in-flight changes (useSyncExternalStore contract). */
export function subscribePendingWalletRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether an abortable WC request is currently awaiting the wallet. */
export function hasPendingWalletRequest(): boolean {
  return inFlight.size > 0
}

/**
 * Abort every in-flight guarded request (in practice at most one, the flows
 * serialise). Each rejects with `WalletError('declined')`, which the calling
 * flow's existing decline handling absorbs. No-op when nothing is pending.
 */
export function abortPendingWalletRequest(): void {
  for (const abort of [...inFlight]) abort()
}

/** Best-effort, bounded session teardown; never throws, never blocks the exit. */
async function dropSession(disconnect: () => Promise<void>): Promise<void> {
  try {
    await Promise.race([
      disconnect(),
      new Promise<void>((resolve) => setTimeout(resolve, WC_DISCONNECT_CAP_MS)),
    ])
  } catch {
    // The session may already be dead — the point was to stop trusting it.
  }
}

/**
 * Race a WC request against the timeout + abort exits. Returns the wallet's
 * result when it answers in time; throws `WalletError('timeout')` /
 * `WalletError('declined')` otherwise. A late settlement of the underlying
 * promise is swallowed (its outcome is either captured here or superseded —
 * the server-side chain listener owns the truth for broadcast-but-unreported
 * transactions).
 */
export async function guardWcRequest<T>(
  pending: Promise<T>,
  opts?: { timeoutMs?: number; disconnect?: () => Promise<void> },
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? WC_REQUEST_TIMEOUT_MS
  const disconnect = opts?.disconnect ?? (() => connectionSignal.disconnect())
  // Detach a swallow branch so a post-guard settlement can't surface as an
  // unhandled rejection.
  void pending.then(
    () => undefined,
    () => undefined,
  )

  let timer: ReturnType<typeof setTimeout> | null = null
  let abort: Aborter = () => {}
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => {
        void dropSession(disconnect)
        reject(new WalletError('declined', WC_CANCELLED_MESSAGE))
      }
      inFlight.add(abort)
      notify()
      timer = setTimeout(() => {
        void dropSession(disconnect)
        reject(new WalletError('timeout', WC_TIMEOUT_MESSAGE))
      }, timeoutMs)
      pending.then(resolve, reject)
    })
  } finally {
    if (timer !== null) clearTimeout(timer)
    inFlight.delete(abort)
    notify()
  }
}
