/**
 * Wallet sign-in / linking via the server-nonce flow (port of
 * apps/mobile/wallet/auth.ts — keep the two aligned).
 *
 * Flow: POST /v1/auth/nonce → `adapter.authenticate` builds + signs the
 * shared `buildAuthMessage` template → POST /v1/auth/verify
 * { method: 'wallet' } (sign-in) or /v1/auth/link-wallet (link).
 *
 * Decision #3: wallet signs in but never CREATES an account — the unified
 * verify route is find-or-reject (404 WALLET_NOT_LINKED for an unknown
 * wallet), so no signup bootstrap rides this path.
 */
import { buildAuthMessage } from '@tenda/shared'
import type { VerifyResponse, WalletAccount } from '@tenda/shared'
import { api } from '@/api/client'
// lib/api-config, NOT shared apiConfig: the base URL only resolves in app
// code where Next inlines NEXT_PUBLIC_API_URL (the CJS-dep landmine).
import { apiConfig } from '@/lib/config/api-config'
import { getEnv } from '@/lib/config/env'
import { WALLET_CHAINS } from '@/wallet/config'
import type { WalletAdapter } from '@/wallet/adapters/types'

/**
 * Nonce-bound auth message for a connected account, built with the canonical
 * server-registered chain id for that account's namespace (NOT the wallet's
 * arbitrary current chain — the signature is namespace-scoped, and the
 * server only verifies against registered chains).
 */
function authMessageFor(account: WalletAccount, nonce: string): string {
  return buildAuthMessage({
    address: account.address,
    chain_id: WALLET_CHAINS[account.namespace],
    uri: apiConfig[getEnv()].baseUrl,
    nonce,
  })
}

export interface WalletSignInResult {
  auth: VerifyResponse
  account: WalletAccount
}

/**
 * Sign in with any wallet adapter: nonce → authenticate → POST
 * /v1/auth/verify { method: 'wallet' }. Find-or-reject: an unknown wallet
 * throws WALLET_NOT_LINKED (the caller renders the first-class "get started
 * with email first" state). Resolves null when the user declines in the
 * wallet; throws on transport or server failure.
 */
export async function signInWithWallet(
  adapter: WalletAdapter,
): Promise<WalletSignInResult | null> {
  const { nonce } = await api.auth.nonce()
  const result = await adapter.authenticate((account) => authMessageFor(account, nonce))
  if (result === null) return null

  const { account, signature, message } = result
  const auth = await api.auth.verify({
    method: 'wallet',
    chain_id: WALLET_CHAINS[account.namespace],
    address: account.address,
    message,
    signature,
  })
  return { auth, account }
}

/**
 * Link an additional wallet to the authenticated account: nonce →
 * authenticate(forceFresh) → POST /v1/auth/link-wallet. `forceFresh`
 * discards any existing wallet session so the user can pick a DIFFERENT
 * account than the one already on their JWT. Returns the linked account, or
 * null on decline.
 */
export async function linkWalletWith(adapter: WalletAdapter): Promise<WalletAccount | null> {
  const { nonce } = await api.auth.nonce()
  const result = await adapter.authenticate((account) => authMessageFor(account, nonce), {
    forceFresh: true,
  })
  if (result === null) return null

  await api.auth.linkWallet({
    chain_id: WALLET_CHAINS[result.account.namespace],
    address: result.account.address,
    message: result.message,
    signature: result.signature,
  })
  return result.account
}
