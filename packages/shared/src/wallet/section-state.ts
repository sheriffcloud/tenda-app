import type { LoadStatus } from '../types/load-status'

/**
 * Which balance section the wallet screen owes the user, resolved from the two
 * INDEPENDENT loads it depends on: the linked wallets (auth store) and the
 * chain registry (chain-registry store). Pure and exhaustive so the branch is
 * unit-testable without React, and so the screen stays a dumb switch.
 *
 * Keeping it in one place is what stops the two loads being conflated again:
 * every "nothing to show" used to collapse into the same silent render — an
 * unloaded registry produced zero (wallet, chain) pairs, so a user WITH a
 * linked wallet saw an authoritative `0.00 USDC` and no rows, which is the
 * difference between "you have no money" and "we could not check".
 */

/**
 * Load lifecycle both dependencies report themselves with — one union so the
 * two stores (each client's auth store and chain-registry store) cannot
 * diverge in vocabulary.
 *
 * An ALIAS of the general `LoadStatus` since #35, which needed the same four
 * states for the profile counts and found this union already spelled out here
 * under a wallet-specific name. Every existing import keeps working; there is
 * now one definition rather than one per feature.
 */
export type WalletLoadStatus = LoadStatus
export type WalletsStatus = WalletLoadStatus
export type ChainRegistryStatus = WalletLoadStatus

/**
 * Whether the registry holds something a balance read can actually use. An
 * EMPTY array is not usable and must not be mistaken for a loaded registry:
 * `readWalletBalances` pairs each wallet against the chains sharing its
 * namespace, so zero chains yields zero pairs — downstream, indistinguishable
 * from a wallet holding nothing. It is also a reachable state (a persisted
 * `[]`, or a deployment with no enabled chains) that a `!== null` guard would
 * treat as loaded forever, defeating the retry.
 */
export function isRegistryUsable(chains: readonly unknown[] | null): boolean {
  return chains !== null && chains.length > 0
}

export type WalletSectionState =
  /** Either dependency is still settling — show the hero skeleton. */
  | 'loading'
  /** The linked-wallet load failed; retry with `retryWallets`. */
  | 'wallets-error'
  /** Settled, and the user genuinely has no linked wallet. */
  | 'no-wallet'
  /** Wallets are known, but the chain registry FAILED to load; retry with
   *  `retryChains`. A registry merely still in flight is 'loading', not this. */
  | 'balances-unavailable'
  /** Both dependencies are usable — render balances. */
  | 'ready'

export interface WalletSectionInput {
  walletsStatus: WalletsStatus
  hasWallet: boolean
  chainsStatus: ChainRegistryStatus
  /** `isRegistryUsable(chains)` — non-null AND non-empty. */
  registryUsable: boolean
}

export function resolveWalletSection({
  walletsStatus,
  hasWallet,
  chainsStatus,
  registryUsable,
}: WalletSectionInput): WalletSectionState {
  // The wallet list is resolved first: without it there is nothing to read
  // balances FOR, so a registry problem is not yet the user's problem.
  if (!hasWallet) {
    if (walletsStatus === 'error') return 'wallets-error'
    // Only a settled `ready` load with an empty list is genuinely wallet-less;
    // `idle`/`loading` must not be advertised as "no wallet linked".
    return walletsStatus === 'ready' ? 'no-wallet' : 'loading'
  }

  if (registryUsable) return 'ready'
  // Registry unusable: a failed fetch is actionable (retry), anything else is
  // still in flight. `idle` counts as in flight — ensureLoaded is what moves
  // it, and it fires on the same focus that renders this.
  return chainsStatus === 'error' ? 'balances-unavailable' : 'loading'
}
