/**
 * Wallet-address identity, namespace-aware. EVM (eip155) addresses are
 * case-INsensitive: the EIP-55 checksum is a display convention only, so the
 * SAME wallet arrives in different case (Trust → lowercase, others →
 * checksummed). Solana (base58) is case-SENSITIVE, different case is a
 * DIFFERENT address.
 *
 * Two distinct concerns, two helpers:
 *   - `normalizeWalletAddress`, the canonical form written on INSERT, so the
 *     case-sensitive `(chain_ns, address)` primary key dedups the same wallet.
 *   - `sameWalletAddress` / `walletAddressEquals`, case-folding COMPARISON for
 *     reads. Storage is only normalised going forward (legacy rows may still be
 *     checksummed), so every lookup must fold case on BOTH sides rather than
 *     normalise one and compare to the raw stored value, otherwise it silently
 *     misses legacy mixed-case rows (unlink "not linked", login "unknown wallet").
 */
import { eq, sql, type SQL } from 'drizzle-orm'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { normalizeChainAddress, sameChainAddress } from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared/db/schema'

// Canonical normalize/compare live in @tenda/shared (shared with the admin
// resolve-sign pre-flight); re-exported here under the server's names so the
// existing call sites and the SQL helper below stay put.
export const normalizeWalletAddress = normalizeChainAddress
export const sameWalletAddress = sameChainAddress

/**
 * A SQL WHERE fragment matching `user_wallets.address` to `address` the same
 * case-insensitive way `sameWalletAddress` does, for queries that can't fold in
 * memory. EVM folds with `lower(...)`; Solana compares exactly (and keeps its
 * btree index). The wallets table is small, so the EVM seq-scan is immaterial.
 */
export function walletAddressEquals(chain_ns: ChainNamespace, address: string): SQL {
  return chain_ns === 'eip155'
    ? sql`lower(${user_wallets.address}) = ${address.toLowerCase()}`
    : eq(user_wallets.address, address)
}
