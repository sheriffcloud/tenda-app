/**
 * Wallet sign-in / linking via the server-nonce flow (cutover §6, replaces the
 * ±5min timestamp window the server dropped at #28).
 *
 * Flow: POST /v1/auth/nonce → `adapter.authenticate` builds + signs the shared
 * `buildAuthMessage` template → POST /v1/auth/verify { method: 'wallet' }
 * (sign-in, Stage 9) or /v1/auth/link-wallet (link). Adapter-agnostic: each
 * WalletAdapter owns its own connect+sign round-trip; this module only
 * orchestrates the nonce↔server exchange and pins the canonical,
 * server-registered chain id per namespace (WALLET_CHAINS, single source,
 * wallet/config.ts).
 *
 * Decision #3 (Stage 9): wallet signs in but never CREATES an account, the
 * unified verify route is find-or-reject (404 WALLET_NOT_LINKED for an unknown
 * wallet). New accounts are born from a contact-bearing method on get-started;
 * device-derived signup bootstrap (is_seeker/country) therefore has no home on
 * this path and is no longer sent.
 */

import { buildAuthMessage, apiConfig, type VerifyResponse } from '@tenda/shared'
import { api } from '@/api/client'
import { getEnv } from '@/lib/env'
import { WALLET_CHAINS } from '@/wallet/config'
import type { WalletAccount } from '@tenda/shared'
import type { WalletAdapter } from '@/wallet/adapters/types'

/**
 * Nonce-bound auth message for a connected account, built with the canonical
 * server-registered chain id for that account's namespace (NOT the wallet's
 * arbitrary current chain, the signature is namespace-scoped, and the server
 * only verifies against registered chains).
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
 * Sign in with any wallet adapter: nonce → authenticate → POST /v1/auth/verify
 * { method: 'wallet' }. Find-or-reject, an unknown wallet throws
 * WALLET_NOT_LINKED (the caller maps it to the Tier-0 "get started first" UX).
 * Resolves to null when the user declines in the wallet; throws on transport or
 * server failure.
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
 * authenticate(forceFresh) → POST /v1/auth/link-wallet. `forceFresh` discards
 * any existing wallet session so the user can pick a DIFFERENT account than the
 * one already on their JWT. Returns the linked account, or null on decline.
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
