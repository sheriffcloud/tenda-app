/**
 * Shared Solana Mobile Wallet Adapter helpers used by every Android-side
 * Solana adapter (Phantom, Solflare, future MWA-capable wallets).
 *
 * The single MWA transport core post-#34, the legacy wallet/index.ts MWA
 * path was deleted at the cutover; auth + signing flows ride these helpers.
 */
import {
  transact,
  type Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import { WalletError } from '@tenda/shared'
import { metadata, SOLANA_NETWORK } from '../config'

// MWA spec: `identity.icon` MUST be a relative URI. Don't reuse the absolute
// `metadata.iconUrl` (that one is for MM Connect / dApp registries).
const IDENTITY = {
  name: metadata.name,
  uri: metadata.url,
  icon: './favicon.ico',
}

interface MwaError {
  name: string
  message: string
}

function isMwaError(err: unknown): err is MwaError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as Record<string, unknown>).name === 'string' &&
    typeof (err as Record<string, unknown>).message === 'string'
  )
}

export function isMwaStaleAuth(err: unknown): boolean {
  return (
    isMwaError(err) &&
    err.name === 'SolanaMobileWalletAdapterProtocolError' &&
    err.message.includes('authorization request failed')
  )
}

export function isMwaTransient(err: unknown): boolean {
  return (
    isMwaError(err) &&
    err.name === 'SolanaMobileWalletAdapterError' &&
    err.message.includes('CancellationException')
  )
}

/** "cancelled by user" / "canceled by user" (either spelling). */
const CANCELLED_BY_USER = /cancell?ed by user/i

/** The error's `.code` as a string, or '', `code` may be a string or absent. */
function mwaCodeText(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

export function isMwaUserDeclined(err: unknown): boolean {
  if (!isMwaError(err)) return false
  // Tapped "Cancel" inside the wallet.
  if (
    err.name === 'SolanaMobileWalletAdapterError' &&
    err.message.includes('AuthorizationDeclined')
  ) {
    return true
  }
  // Dismissed the OS wallet chooser before picking one, the native layer
  // rejects with "Local association cancel(l)ed by user" on EITHER the message
  // or the reject `.code` (it varies by SDK layer / device), and the wrapped
  // error's `name` is not always `SolanaMobileWalletAdapterError`, so we match
  // the phrase on both fields and both spellings. "by user" keeps this from
  // catching the transient `CancellationException` (which we retry).
  if (CANCELLED_BY_USER.test(err.message) || CANCELLED_BY_USER.test(mwaCodeText(err))) {
    return true
  }
  // Protocol error code -1 = "approval denied" per the MWA spec.
  if (
    err.name === 'SolanaMobileWalletAdapterProtocolError' &&
    err.message.startsWith('-1/')
  ) {
    return true
  }
  return false
}

export function isMwaNoWallet(err: unknown): boolean {
  return (
    isMwaError(err) &&
    err.name === 'SolanaMobileWalletAdapterError' &&
    err.message.includes('no installed wallet')
  )
}

/**
 * The stable `.code` on a `SolanaMobileWalletAdapterError` (per the SDK's
 * `SolanaMobileWalletAdapterErrorCode` enum), or null for any other shape.
 * Reading the code is more robust than message-substring matching for the
 * native-originated session errors below, whose messages vary by device.
 */
function mwaErrorCode(err: unknown): string | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string, unknown>).name === 'SolanaMobileWalletAdapterError' &&
    typeof (err as Record<string, unknown>).code === 'string'
  ) {
    return (err as { code: string }).code
  }
  return null
}

/**
 * The local association failed to ESTABLISH, or was torn down before the wallet
 * answered for a NON-user reason, distinct from a decline (in-wallet "Cancel" =
 * protocol code -1; dismissing the OS chooser = "cancelled by user"; both caught
 * first by `isMwaUserDeclined` and never retried). `ERROR_SESSION_TIMEOUT` is a
 * slow/cold wallet losing the association handshake race (Phantom is heavy to
 * cold-start, so its sheet sometimes never appears); `ERROR_SESSION_CLOSED` here
 * is the association dropping when the wallet fails to auto-return to the dapp
 * (without the explicit user-cancel message). Both are retryable: the first
 * attempt launches and warms the wallet, so a second attempt usually establishes
 * cleanly, far better than a dead-end on every cold Phantom connect.
 */
export function isMwaSessionInterrupted(err: unknown): boolean {
  const code = mwaErrorCode(err)
  return code === 'ERROR_SESSION_TIMEOUT' || code === 'ERROR_SESSION_CLOSED'
}

/**
 * The dapp (we are the WebSocket *client*) couldn't reach the wallet's local
 * association server before the native connect-retry budget (~9s) expired,
 * `ConnectionFailedException: Unable to connect to websocket server`, from
 * repeated ECONNREFUSED. This is a pure cold-start race: a heavy wallet
 * (Phantom is itself a React-Native app) hasn't booted its MWA server yet,
 * with NO user action. Retryable: the retry re-launches the now-warming wallet
 * and opens a fresh connect window; no association was established so nothing
 * is left half-open.
 *
 * It surfaces as a RAW native error (no `SolanaMobileWalletAdapterError` code),
 * so we match its message, but ONLY this exact reason. The sibling
 * `ConnectionFailedException: "Scenario closed while connecting" / "...during
 * session establishment"` fire from `onActivityResult` when the USER returned
 * to the app (backed out of the wallet/chooser) before establishment, a user
 * action we must NOT auto-retry, or the wallet/chooser re-opens "on its own".
 * Device logcat (2026-06-23) showed every failure on this hardware was the
 * Scenario-closed variant, so matching the broad class would be actively wrong.
 */
function mwaMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as Record<string, unknown>).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  return ''
}

export function isMwaConnectionFailed(err: unknown): boolean {
  const msg = mwaMessage(err)
  return (
    msg.includes('Unable to connect to websocket server') &&
    !msg.includes('Scenario closed')
  )
}

export interface AuthorizeResult {
  authToken: string
  addressBase64: string
}

/**
 * The slice of the MWA wallet `authorizeSession` actually uses. Narrowing the
 * parameter to this (rather than the full `Web3MobileWallet`) is interface
 * segregation: real callers inside `transact()` still pass a full wallet, but
 * tests can supply a two-method double without standing up the whole surface.
 */
export type AuthorizingWallet = Pick<Web3MobileWallet, 'authorize' | 'reauthorize'>

/**
 * Reauthorize with an existing token if available; fall through to a fresh
 * authorize only when the token is specifically stale. Non-stale errors
 * bubble, they're real failures (network, declined) we want to surface.
 */
export async function authorizeSession(
  wallet: AuthorizingWallet,
  existingAuthToken: string | null,
): Promise<AuthorizeResult> {
  if (existingAuthToken) {
    try {
      const reauth = await wallet.reauthorize({
        auth_token: existingAuthToken,
        identity: IDENTITY,
      })
      const account = reauth.accounts[0]
      if (account) {
        return { authToken: reauth.auth_token, addressBase64: account.address }
      }
    } catch (err) {
      if (!isMwaStaleAuth(err)) throw err
      // Token revoked: WS is still open, fall through to a fresh authorize.
    }
  }
  const auth = await wallet.authorize({
    chain: `solana:${SOLANA_NETWORK}`,
    identity: IDENTITY,
  })
  const account = auth.accounts[0]
  if (!account) throw new Error('Wallet returned no account')
  return { authToken: auth.auth_token, addressBase64: account.address }
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500
// Session-interruption retries wait a touch longer: the first attempt has just
// launched (and is still warming) a heavy wallet like Phantom, so give it a
// moment to settle before re-establishing the association.
const SESSION_RETRY_DELAY_MS = 800

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wraps `transact()` with retry on the recoverable MWA failures:
 *  - CancellationException, the user dismissed-and-reopened the wallet picker;
 *  - session establishment/teardown (`ERROR_SESSION_TIMEOUT` / `..._CLOSED`),
 *    a slow/cold wallet losing the association race or failing to auto-return,
 *    which a warm second attempt usually clears (see `isMwaSessionInterrupted`);
 *  - the cold-start WebSocket `ConnectionFailedException`, a heavy wallet
 *    (Phantom) whose MWA server hasn't booted inside the native ~9s connect
 *    budget; the retry re-launches it and opens a fresh window
 *    (see `isMwaConnectionFailed`).
 * User-declined and no-wallet errors are mapped to clearer typed `WalletError`s
 * and never retried, so adapter callers don't need MWA's protocol error strings.
 *
 * `baseUri` targets a specific wallet's MWA endpoint (e.g. `'phantom:'` or
 * `'solflare:'`) so the OS routes directly to that wallet instead of showing
 * the generic Android chooser. Omit to fall back to MWA's standard discovery.
 */
export async function withMwaRetry<T>(
  op: (wallet: Web3MobileWallet) => Promise<T>,
  baseUri?: string,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await transact(op, baseUri ? { baseUri } : undefined)
    } catch (err) {
      // Typed errors so screens can branch on .code (connect-wallet's
      // no_wallet install prompt, decline handling, etc.). A real decline is
      // checked first so it can never be swept into the session-retry path.
      if (isMwaUserDeclined(err)) {
        throw new WalletError('declined', 'Wallet request declined', err)
      }
      const warming = isMwaSessionInterrupted(err) || isMwaConnectionFailed(err)
      if ((isMwaTransient(err) || warming) && attempt < MAX_RETRIES) {
        await delay(warming ? SESSION_RETRY_DELAY_MS : RETRY_DELAY_MS)
        continue
      }
      if (isMwaNoWallet(err)) {
        throw new WalletError('no_wallet', 'No Solana wallet app installed', err)
      }
      throw err
    }
  }
  // Unreachable, the final attempt either returns or throws.
  throw new Error('MWA: exhausted retries unexpectedly')
}
