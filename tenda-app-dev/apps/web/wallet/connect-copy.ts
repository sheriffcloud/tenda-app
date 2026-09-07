import type { ConnectErrorCopy } from '@tenda/shared'

/**
 * Web's no_wallet copy for the shared classifier's override seam: on web the
 * code means "wallet connect is not configured for this build" (no Reown
 * project id), NOT "install a wallet app" (mobile's meaning). One definition
 * — both the sign-in panel and linked-wallets consume it.
 */
export const WEB_NO_WALLET_COPY: ConnectErrorCopy = {
  title: 'Wallet connect unavailable',
  description: 'Wallet sign-in is not configured for this build. Continue with email instead.',
}
