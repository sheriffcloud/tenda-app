/**
 * Shared `authenticate` composer for transports whose connect and sign are
 * separate wallet round-trips (WalletConnect, Phantom, web AppKit), as
 * opposed to MWA, which folds both into one session and implements
 * `authenticate` directly. (Moved from apps/mobile/wallet/adapters/
 * connect-then-sign.ts, 2026-08-15 — now shared by mobile and web.)
 *
 * Keeps the per-adapter wiring to a one-liner and centralises user-decline
 * detection so every transport surfaces a decline as `null` (not a throw).
 */
import { WalletError } from './errors'
import type { AuthenticateResult, SignMessageResult, WalletAccount } from './types'

/**
 * A user-decline, normalised across transports:
 *  - MWA / Phantom / our adapters raise a typed `WalletError('declined')`.
 *  - EVM (EIP-1193) raises a provider error with `code === 4001`
 *    ("user rejected request", the JSON-RPC spec value).
 */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof WalletError) return err.code === 'declined'
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return (err as { code: unknown }).code === 4001
  }
  return false
}

/**
 * The structural slice of a WalletAdapter this composer needs — each client
 * passes its own adapter, whatever extra surface that adapter carries.
 */
export interface ConnectSignParts {
  connect(opts?: { fresh?: boolean }): Promise<WalletAccount>
  signMessage(account: WalletAccount, message: string): Promise<SignMessageResult>
  disconnect(): Promise<void>
}

export async function connectThenSign(
  parts: ConnectSignParts,
  buildMessage: (account: WalletAccount) => string,
  opts?: { forceFresh?: boolean },
): Promise<AuthenticateResult | null> {
  // forceFresh: drop any persisted session so the user can pick a different
  // account (wallet-linking). Best-effort, a failed revoke must not block.
  if (opts?.forceFresh) {
    try {
      await parts.disconnect()
    } catch {
      // ignore, local state is what matters; remote revoke is advisory.
    }
  }

  let account: WalletAccount
  try {
    // Pass `fresh` after a forceFresh revoke so transports that reuse a live
    // session (WalletConnect) re-open the picker instead of short-circuiting
    // back to the just-disconnected account.
    account = await parts.connect(opts?.forceFresh ? { fresh: true } : undefined)
  } catch (err) {
    if (isUserRejection(err)) return null
    throw err
  }

  const message = buildMessage(account)
  try {
    const { signature } = await parts.signMessage(account, message)
    return { account, signature, message }
  } catch (err) {
    if (isUserRejection(err)) return null
    throw err
  }
}
