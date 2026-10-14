/**
 * Web `WalletAdapter` — the same uniform seam as apps/mobile/wallet/adapters/
 * types.ts, minus the concerns a browser cannot have: no bundled icon assets
 * (`iconSource`) and no `isInstalled()` deeplink probing — AppKit's modal
 * renders its own wallet list with live icons and install state. The account
 * and result shapes are the shared platform-neutral types.
 */
import type {
  AuthenticateResult,
  ChainNamespace,
  SignMessageResult,
  WalletAccount,
} from '@tenda/shared'

export interface WalletAdapter {
  /** Stable identifier stored on `WalletAccount.walletId`. */
  readonly id: string
  /** Display name in any picker UI. */
  readonly name: string
  /** Optional one-line subtitle naming example wallets. */
  readonly tagline?: string
  /** Which CAIP-2 namespaces this adapter can talk to. */
  readonly namespaces: readonly ChainNamespace[]

  /** Whether this adapter is usable in this build (e.g. Reown configured). */
  isAvailable(): Promise<boolean>

  /**
   * Open the wallet modal, request approval, and resolve with the connected
   * account. `fresh` forces a new picker round-trip even if a session is
   * already live (wallet-linking, where the user must be able to choose a
   * different account).
   */
  connect(opts?: { fresh?: boolean }): Promise<WalletAccount>

  /** Request the wallet to sign `message` for `account`. */
  signMessage(account: WalletAccount, message: string): Promise<SignMessageResult>

  /**
   * One auth round-trip for the server-nonce flow: connect (revealing the
   * address), build the message from the connected account, and sign it —
   * composed through the shared `connectThenSign`, so a user decline
   * resolves `null` (never throws) on every transport.
   */
  authenticate(
    buildMessage: (account: WalletAccount) => string,
    opts?: { forceFresh?: boolean },
  ): Promise<AuthenticateResult | null>

  /** End any persistent session this adapter holds. Safe when not connected. */
  disconnect(): Promise<void>

  /**
   * Best-effort restore. Returns the previously connected account if a valid
   * session is already live, otherwise `null` — without booting the wallet
   * runtime just to answer.
   */
  getRestoredAccount(): Promise<WalletAccount | null>
}
