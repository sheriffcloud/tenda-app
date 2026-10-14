/**
 * Map a wallet connect/sign failure to user-facing error copy — ONE copy
 * table for every client (moved from apps/mobile/lib/connect-wallet-error.ts,
 * 2026-08-15). WALLET_NOT_LINKED is handled by the caller (it routes to the
 * get-started flow); everything else lands here.
 *
 * Platform seams, injected rather than imported:
 *  - `devDetail`: surface the raw message on dev builds (mobile passes
 *    __DEV__, web its env) so unverified wallet flows stay debuggable.
 *  - `noWalletCopy`: the one branch whose MEANING differs per platform —
 *    mobile raises no_wallet when no wallet APP is installed; web raises it
 *    when wallet connect is not configured for the build.
 *  - The secondary action is a URL (`secondaryUrl`); each client binds its
 *    own opener (RN Linking / an anchor).
 */
import { WalletError } from './errors'
import { ApiClientError } from '../api/client-error'
import { APP_INFO } from '../constants/app-info'

export interface ConnectErrorCopy {
  title: string
  description: string
  secondaryLabel?: string
  /** Outbound link for the secondary action, when one exists. */
  secondaryUrl?: string
}

const NO_CONNECTION: ConnectErrorCopy = {
  title: 'No connection',
  description: 'Check your internet connection and try again.',
}

const DEFAULT_NO_WALLET: ConnectErrorCopy = {
  title: 'No wallet found',
  description: 'Install Phantom or Solflare on your device, then come back to connect.',
  secondaryLabel: 'Get Phantom',
  secondaryUrl: APP_INFO.wallets.phantom.playStore,
}

export function classifyConnectError(
  error: unknown,
  opts?: { devDetail?: boolean; noWalletCopy?: ConnectErrorCopy },
): ConnectErrorCopy {
  if (error instanceof WalletError) {
    switch (error.code) {
      case 'no_wallet':
        return opts?.noWalletCopy ?? DEFAULT_NO_WALLET
      case 'declined':
        return {
          title: 'Connection cancelled',
          description: 'You closed the wallet prompt. Tap below to try again.',
        }
      case 'network':
        return NO_CONNECTION
      case 'unknown':
      default:
        return {
          title: 'Something went wrong',
          description: 'An unexpected error occurred. Please try again.',
        }
    }
  }
  if (error instanceof ApiClientError && (error.statusCode === 401 || error.statusCode === 403)) {
    return {
      title: 'Sign-in failed',
      description: "The server couldn't verify your wallet. Please try again.",
    }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return NO_CONNECTION
  }
  // Dev builds surface the underlying error so an unverified wallet flow
  // (#68: Phantom iOS, MetaMask sign) is debuggable instead of hiding behind
  // a generic message.
  const detail = error instanceof Error ? error.message : String(error)
  return {
    title: 'Something went wrong',
    description: opts?.devDetail === true
      ? `Unexpected error: ${detail}`
      : 'An unexpected error occurred. Please try again.',
  }
}
