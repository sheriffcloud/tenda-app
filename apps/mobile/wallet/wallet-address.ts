import type { ChainNamespace, LinkedWallet } from '@tenda/shared'

/** EVM addresses are checksum-agnostic; Solana base58 is case-sensitive. */
function addressesEqual(ns: ChainNamespace, a: string, b: string): boolean {
  return ns === 'eip155' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** The user's VERIFIED linked wallets on a namespace (the only trusted set). */
function verifiedWallets(ns: ChainNamespace, wallets: LinkedWallet[]): LinkedWallet[] {
  return wallets.filter((w) => w.chain_ns === ns && w.verified_at !== null)
}

/** Whether `address` is a verified linked wallet on this namespace. */
export function isLinkedWallet(ns: ChainNamespace, address: string, wallets: LinkedWallet[]): boolean {
  return verifiedWallets(ns, wallets).some((w) => addressesEqual(ns, w.address, address))
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
  const verified = verifiedWallets(ns, wallets)
  return (verified.find((w) => w.is_primary) ?? verified[0])?.address ?? null
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
  const rest = verifiedWallets(ns, wallets)
    .map((w) => w.address)
    .filter((a) => !addressesEqual(ns, a, head))
  return [head, ...rest]
}
