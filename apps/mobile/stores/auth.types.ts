/**
 * Auth store shape. Extracted from `auth.store.ts` so the store file stays
 * under the size budget and the (heavily documented) contract is browsable on
 * its own. Runtime state + actions live in the store; this is types only.
 */

import type { User, LinkedWallet, VerifyBody, IdentityMethodWire } from '@tenda/shared'
import type { WalletAdapter } from '@/wallet/adapters/types'
import type { WalletsStatus } from '@/stores/wallet-sync'

export interface AuthState {
  user: User | null
  jwt: string | null
  walletAddress: string | null
  /**
   * Connected EVM account (CO3), session-scoped, set by `signInWithWallet`
   * on an eip155 sign-in and cleared on logout. NOT persisted: after a
   * restart it stays null and the evm-tx dispatch path falls back to the
   * verified linked eip155 wallet (from `wallets[]`). It only bridges the
   * window between an EVM login and the first `refreshMe`.
   */
  evmAddress: string | null
  isAuthenticated: boolean
  isLoading: boolean
  /**
   * A wallet sign-in is mid-flight (nonce → authenticate → verify). The wallet's
   * `tenda://` return deep link can bounce the app through the `/` index route
   * before verify completes; `index` reads this to hold a spinner instead of
   * flashing the welcome/get-started screen. Cleared when the flow settles.
   */
  walletAuthInProgress: boolean
  /** Stage 1 multi-wallet state, from GET /v1/users/me. */
  wallets: LinkedWallet[]
  /**
   * Lifecycle of the `wallets[]` load, so the UI can tell "still loading" from
   * "loaded, none linked" from "load failed" (offer a retry) — states the bare
   * `wallets.length` could not express, which let a silent fetch failure read
   * as "no wallet".
   */
  walletsStatus: WalletsStatus
  /** null until /v1/users/me has answered at least once this session. */
  profileComplete: boolean | null
  /**
   * Non-wallet sign-in identities (phone/email/OAuth) from GET /v1/auth/methods,
   * for the Sign-in & security screen. Empty until `loadMethods` answers.
   */
  identities: IdentityMethodWire[]

  /**
   * Sign in with any wallet adapter (nonce → authenticate → verify → JWT).
   * Find-or-reject (decision #3): an unknown wallet throws WALLET_NOT_LINKED;
   * the wallet never creates an account. Resolves to false when the user
   * declines in the wallet, true on success. Throws on transport or server
   * failure (the connect-wallet screen maps WALLET_NOT_LINKED to Tier-0). The
   * connected account's address is published to the namespace-appropriate slot
   * (`walletAddress` for Solana, consumed as a Solana pubkey, or `evmAddress`
   * for EVM).
   */
  signInWithWallet: (adapter: WalletAdapter) => Promise<boolean>
  /**
   * Link an ADDITIONAL wallet to the already-authenticated account (nonce →
   * authenticate(forceFresh) → POST /v1/auth/link-wallet → refreshMe). Sets
   * `walletAuthInProgress` for the same reason sign-in does: the new wallet's
   * `tenda://` return deep link bounces the app through `/`, and `index` must
   * hold a spinner rather than redirect an authed user home mid-link. Resolves
   * true on link, false when the user declines; throws ApiClientError (the
   * screen maps 409/etc. to a toast).
   */
  linkWallet: (adapter: WalletAdapter) => Promise<boolean>
  /**
   * Stage 9 unified sign-in, verify a credential proof (phone/email OTP,
   * OAuth id_token, or wallet signature) via POST /v1/auth/verify and set the
   * session. No wallet is required. Always calls verify ANONYMOUSLY (no
   * bearer), the header is the server's link/sign-in discriminator, and a
   * stale stored JWT would otherwise 401 every sign-in attempt.
   * Returns whether the account was just created. Throws ApiClientError (the
   * caller maps WALLET_NOT_LINKED / IDENTITY_ALREADY_LINKED to the Tier-0 UX).
   */
  signInWithVerify: (body: VerifyBody) => Promise<{ isNew: boolean }>
  /**
   * Stage 9, LINK a verified contact (phone/email OTP) to the ALREADY-signed-in
   * account, used by the Sign-in & security screen. Same POST /v1/auth/verify as
   * sign-in but with `link: true` (bearer attached → server links to the current
   * user), and it does NOT touch the session token or navigation, it just
   * refreshes the cached user/wallets/identities. Throws ApiClientError (the
   * screen maps IDENTITY_ALREADY_LINKED etc. to a toast).
   */
  linkIdentity: (body: VerifyBody) => Promise<void>
  /** Re-fetch sign-in identities from GET /v1/auth/methods. */
  loadMethods: () => Promise<void>
  logout: () => Promise<void>
  loadSession: () => Promise<void>
  updateUser: (user: User) => void
  refreshUser: () => Promise<void>
  /** Re-fetch wallets + profile_complete from /v1/users/me (bounded retry). */
  refreshMe: () => Promise<void>
  /**
   * Re-run the wallets[] load after it failed (`walletsStatus === 'error'`).
   * Surfaced by the wallet screen's retry affordance so a transient failure is
   * recoverable without a full re-login.
   */
  retryWalletSync: () => Promise<void>
}
