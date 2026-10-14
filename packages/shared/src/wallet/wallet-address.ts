/**
 * Signer resolution over the LINKED wallets registry — pure, moved from
 * apps/mobile/wallet/wallet-address.ts 2026-08-15 so web's dispatch resolves
 * signers with the exact same trust rules.
 */
import type { ChainNamespace } from '../db/schema/chains'
import type { LinkedWallet } from '../api/contracts/auth.contract'
import { sameChainAddress } from '../utils/address'

/**
 * THE address comparison for signer checks (dispatch's signer_address
 * enforcement, the wrong-wallet retry) — the wallet-domain name for the ONE
 * shared identity rule in utils/address (EVM checksum-agnostic, Solana
 * case-exact). An alias, not a second definition: two comparators is how the
 * case rule drifts.
 */
export const sameWalletAddress = sameChainAddress
const addressesEqual = sameChainAddress

/**
 * The user's VERIFIED linked wallets on a namespace — the only trusted set,
 * and the option list every wallet chooser offers. Exported because the
 * predicate was being retyped at each call site (`chain_ns === ns &&
 * verified_at !== null`), which is how an unverified wallet ends up offered
 * on one surface and refused on the next.
 */
export function verifiedWalletsOn(ns: ChainNamespace, wallets: readonly LinkedWallet[]): LinkedWallet[] {
  return wallets.filter((w) => w.chain_ns === ns && w.verified_at !== null)
}

/**
 * The default when nothing else picks: the primary, else the first, else null.
 * ONE owner — `pickWalletAddress` (signing) and `preferredWalletAddress`
 * (choosing) both fall back here, and two copies of a fallback rule is how the
 * two answers start disagreeing about which wallet a user "usually" uses.
 */
function primaryOrFirst(verified: LinkedWallet[]): string | null {
  return (verified.find((w) => w.is_primary) ?? verified[0])?.address ?? null
}

/** Whether `address` is a verified linked wallet on this namespace. */
export function isLinkedWallet(ns: ChainNamespace, address: string, wallets: LinkedWallet[]): boolean {
  return verifiedWalletsOn(ns, wallets).some((w) => addressesEqual(ns, w.address, address))
}

/**
 * The wallet address to use for a namespace. `wallets[]` (from /v1/users/me) is
 * the SINGLE source of trust: a live-connection `session` address is honoured
 * ONLY when it's still a verified linked wallet — so an unlinked wallet is
 * ignored and we fall back to the primary (or first) verified linked wallet.
 * Returns null when the user has no verified wallet on that namespace.
 *
 * Preferring the corroborated session address keeps the quote/escrow-creator
 * address (eligibility) identical to the eventual signer (dispatch).
 *
 * Pure — the tx layer's resolveEvmFrom() supplies the store's session address.
 */
export function pickWalletAddress(
  ns: ChainNamespace,
  session: string | null,
  wallets: LinkedWallet[],
): string | null {
  if (session !== null && isLinkedWallet(ns, session, wallets)) return session
  return primaryOrFirst(verifiedWalletsOn(ns, wallets))
}

/**
 * EVERY verified wallet that could sign on this namespace, most-likely-signer
 * first (that head is exactly `pickWalletAddress`, so the two can never order
 * differently).
 *
 * A transaction is signed by ONE wallet, but which one isn't known until the
 * wallet opens — the user may connect any linked wallet. Balance checks
 * therefore reason over the whole set: "no linked wallet can cover this" is a
 * claim we can stand behind, whereas "the primary is short" is not.
 *
 * Pure — callers supply the store's session address.
 */
export function orderedSignerAddresses(
  ns: ChainNamespace,
  session: string | null,
  wallets: LinkedWallet[],
): string[] {
  const head = pickWalletAddress(ns, session, wallets)
  if (head === null) return []
  const rest = verifiedWalletsOn(ns, wallets)
    .map((w) => w.address)
    .filter((a) => !addressesEqual(ns, a, head))
  return [head, ...rest]
}

/**
 * The wallet a CHOOSER should start on, given as the canonical linked row's
 * address: the remembered choice while it is still verified-linked, else the
 * primary, else the first, else null.
 *
 * Distinct from `pickWalletAddress`, which answers the SIGNING question and
 * echoes the preferred address back verbatim. A picker compares its selection
 * against the rows it renders, so it has to return the row's own spelling of
 * the address — an EVM address remembered in a different case would otherwise
 * match no row and leave the picker looking empty.
 */
export function preferredWalletAddress(
  ns: ChainNamespace,
  preferred: string | null,
  wallets: LinkedWallet[],
): string | null {
  const verified = verifiedWalletsOn(ns, wallets)
  if (preferred !== null) {
    const kept = verified.find((w) => addressesEqual(ns, w.address, preferred))
    if (kept !== undefined) return kept.address
  }
  return primaryOrFirst(verified)
}

/**
 * THE wallet that represents a user in the UI — a drawer handle, a profile
 * header — as opposed to the one that signs on a given chain.
 *
 * Since #42 a user can hold a main wallet on EVERY chain family at once, so
 * `wallets.find(w => w.is_primary)` returns whichever the list happened to
 * order first. Two surfaces did exactly that, and the handle they showed could
 * change between loads for no reason the reader could see.
 *
 * The rule: main wallets first, in `chain_ns` order, then any linked wallet in
 * the same order, then the caller's fallback (the connected session wallet).
 * WHICH family wins matters far less than it never changing — this is a
 * recognisable label, not a chain-scoped fact, and a surface that needs the
 * signer for a chain must call `resolvePrimaryWalletAddress` on the server
 * instead of reading this.
 */
export function displayWalletAddress(
  wallets: readonly LinkedWallet[],
  fallback: string | null = null,
): string | null {
  const ordered = [...wallets].sort(
    (a, b) => a.chain_ns.localeCompare(b.chain_ns) || a.address.localeCompare(b.address),
  )
  return ordered.find((w) => w.is_primary)?.address ?? ordered[0]?.address ?? fallback
}
