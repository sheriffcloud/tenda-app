import { Linking } from 'react-native'
import { WalletError } from '@/wallet/errors'
import { ApiClientError } from '@/api/client'
import { APP_INFO } from '@/lib/app-info'

export type ConnectError = {
  title: string
  description: string
  secondaryLabel?: string
  onSecondaryPress?: () => void
}

/**
 * Map a wallet connect/sign failure to a user-facing ErrorState. WALLET_NOT_LINKED
 * is handled by the caller (it routes to get-started), everything else lands here.
 * Dev builds surface the raw message so the #68 device flows stay debuggable.
 */
export function classifyConnectError(error: unknown): ConnectError {
  if (error instanceof WalletError) {
    switch (error.code) {
      case 'no_wallet':
        return {
          title: 'No wallet found',
          description: 'Install Phantom or Solflare on your device, then come back to connect.',
          secondaryLabel: 'Get Phantom',
          onSecondaryPress: () => Linking.openURL(APP_INFO.wallets.phantom.playStore),
        }
      case 'declined':
        return { title: 'Connection cancelled', description: 'You closed the wallet prompt. Tap below to try again.' }
      case 'network':
        return { title: 'No connection', description: 'Check your internet connection and try again.' }
      case 'unknown':
      default:
        return { title: 'Something went wrong', description: 'An unexpected error occurred. Please try again.' }
    }
  }
  if (error instanceof ApiClientError && (error.statusCode === 401 || error.statusCode === 403)) {
    return { title: 'Sign-in failed', description: "The server couldn't verify your wallet. Please try again." }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return { title: 'No connection', description: 'Check your internet connection and try again.' }
  }
  // Surface the underlying error on dev builds so an unverified wallet flow
  // (#68: Phantom iOS, MetaMask sign) is debuggable on-device instead of
  // hiding behind a generic message.
  const detail = error instanceof Error ? error.message : String(error)
  return {
    title: 'Something went wrong',
    description: __DEV__ ? `Unexpected error: ${detail}` : 'An unexpected error occurred. Please try again.',
  }
}
