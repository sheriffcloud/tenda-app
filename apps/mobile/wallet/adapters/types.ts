import type { ImageRequireSource } from 'react-native'
import type {
  AuthenticateResult,
  ChainNamespace,
  SignMessageResult,
  WalletAccount,
} from '@tenda/shared'

/**
 * Uniform surface every wallet integration implements. The picker, provider,
 * and any consumer code interact with wallets only through this interface,
 * the underlying transport (MetaMask SDK, Coinbase SDK, Solana MWA, Phantom
 * universal links) is an implementation detail of each adapter.
 */
export interface WalletAdapter {
  /** Stable identifier used by the picker and stored on `WalletAccount.walletId`. */
  readonly id: string
  /** Display name in the picker. */
  readonly name: string
  /**
   * Bundled wallet icon, `require('@/assets/wallets/<id>.png')`. Optional:
   * aggregator adapters (WalletConnect) cover many wallets and have no single
   * icon, the picker falls back to a generic wallet glyph.
   */
  readonly iconSource?: ImageRequireSource
  /**
   * Optional one-line picker subtitle naming example wallets (e.g. "Trust,
   * Rainbow & more"). Falls back to the namespace label when absent.
   */
  readonly tagline?: string
  /** Which CAIP-2 namespaces this adapter can talk to. */
  readonly namespaces: readonly ChainNamespace[]

  /**
   * Whether this adapter is usable on the current device/platform. Picker
   * hides adapters that return `false`, e.g. Solflare on iOS (no SDK).
   */
  isAvailable(): Promise<boolean>

  /**
   * Whether the wallet app is present on the device. Picker shows a check
   * mark when `true`. Uses `Linking.canOpenURL` under the hood, relies on
   * the wallet's deeplink scheme being declared in `with-wallet-queries`.
   */
  isInstalled(): Promise<boolean>

  /**
   * Open the wallet, request approval, and resolve with the connected account.
   * `fresh` forces a new picker round-trip even if a session is already live
   * (wallet-linking, where the user must be able to choose a different account);
   * transports without a reusable session ignore it.
   */
  connect(opts?: { fresh?: boolean }): Promise<WalletAccount>

  /** Request the wallet to sign `message` for `account`. */
  signMessage(account: WalletAccount, message: string): Promise<SignMessageResult>

  /**
   * One auth round-trip for the server-nonce flow: connect (revealing the
   * address), build the message from the connected account, and sign it.
   * Each adapter implements this optimally, MWA folds connect+sign into a
   * single wallet session; EVM/Phantom compose `connect()` then
   * `signMessage()` via the shared `connectThenSign` helper.
   *
   * Returns `null` when the user declines; throws on transport failure.
   * `forceFresh` discards any existing session first (wallet-linking, where
   * the user must be able to pick a different account).
   */
  authenticate(
    buildMessage: (account: WalletAccount) => string,
    opts?: { forceFresh?: boolean },
  ): Promise<AuthenticateResult | null>

  /** End any persistent session this adapter holds. Safe to call when not connected. */
  disconnect(): Promise<void>

  /**
   * Best-effort restore on app launch. Returns the previously connected
   * account if the adapter still has a valid session, otherwise `null`.
   */
  getRestoredAccount(): Promise<WalletAccount | null>
}
