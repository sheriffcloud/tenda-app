import { useState, useCallback, useMemo, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { isRegistryUsable } from '@tenda/shared'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { resolveWalletSection } from '@tenda/shared'
import { readWalletBalances, sumUsdcRaw, type WalletChainBalance } from '@tenda/shared'
import { groupByDay } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { amountRawToDisplay } from '@tenda/shared'
import type {
  ChainRegistryEntry,
  LinkedWallet,
  UserEscrowTransaction,
  UserTransactionsQuery,
  UserTransactionsSummary,
} from '@tenda/shared'

const EMPTY_SUMMARY: UserTransactionsSummary = {
  earned_raw: '0',
  spent_raw: '0',
  asset: 'USDC_SOL',
}

const txKey = (tx: UserEscrowTransaction) => tx.id

/**
 * Wallet screen data controller, multichain. Drives off the authoritative
 * linked-wallet list (`wallets[]`) and the chain registry (token addresses),
 * NOT the single Solana session address. Owns: per-(wallet,chain) balances,
 * the summed-USDC headline, the paginated transaction feed, and the USDC
 * lifetime earned/spent totals.
 *
 * Lifetime totals come from `/transactions/summary`, a SQL aggregate over
 * EVERY row — they are NOT reduced from the feed (open_issues MB1). Reducing
 * a page was already understated, and now that the feed pages it would have
 * climbed as the user scrolled, which is worse than being merely wrong.
 */
export function useWalletScreen() {
  const user          = useAuthStore((s) => s.user)
  const wallets       = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const retryWallets  = useAuthStore((s) => s.retryWalletSync)
  const refreshMe     = useAuthStore((s) => s.refreshMe)
  const chains        = useChainRegistryStore((s) => s.chains)
  const chainsStatus  = useChainRegistryStore((s) => s.status)
  const ensureChains  = useChainRegistryStore((s) => s.ensureLoaded)
  const fetchChains   = useChainRegistryStore((s) => s.fetch)

  const [balances, setBalances]   = useState<WalletChainBalance[]>([])
  const [summary, setSummary]     = useState<UserTransactionsSummary>(EMPTY_SUMMARY)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const userId = user?.id ?? null
  const hasWallet = wallets.length > 0

  // The feed itself: paginated, and the ONLY consumer of transaction rows now
  // that the totals are server-computed.
  const transactions = usePaginatedList<UserEscrowTransaction, UserTransactionsQuery>({
    fetchPage: (params) => api.users.transactions({ id: userId ?? '' }, params),
    query: {},
    keyOf: txKey,
    enabled: userId !== null,
  })

  /**
   * Discards the writes of a `load` that a newer one has already superseded.
   * Same guard `usePaginatedList` and `useSpendableBalance` use, and it earns
   * its place here now that the inputs can change mid-flight: linking or
   * unlinking a wallet re-fires the read while an earlier one is still out, and
   * without this the slower, older answer would land last — showing balances
   * for a wallet list the user has already moved on from.
   */
  const loadRunRef = useRef(0)

  /**
   * Read balances + lifetime totals for an EXPLICITLY passed wallet list and
   * registry, rather than closing over the render's copies. Callers that first
   * refresh those inputs (pull-to-refresh) must be able to read the values they
   * just settled — a closure built before the refresh cannot see its result, and
   * making the fresh read depend on "a re-render will follow and re-fire the
   * effect" is a correctness bet on render timing.
   */
  const load = useCallback(async (
    forWallets: readonly LinkedWallet[],
    forChains: readonly ChainRegistryEntry[] | null,
    isRefresh = false,
  ) => {
    const runId = (loadRunRef.current += 1)
    const isCurrent = () => runId === loadRunRef.current

    if (isRefresh) setRefreshing(true)
    else setIsLoading(true)
    try {
      // allSettled so one failure (an RPC hiccup, a summary blip) can't wedge
      // the screen or hide the other half of it.
      await Promise.allSettled([
        readWalletBalances(forWallets, forChains ?? [])
          .then((read) => { if (isCurrent()) setBalances(read) })
          .catch(() => { if (isCurrent()) setBalances([]) }),
        userId === null
          ? Promise.resolve(setSummary(EMPTY_SUMMARY))
          : api.users
              .transactionsSummary({ id: userId })
              .then((fresh) => { if (isCurrent()) setSummary(fresh) })
              // Keep the last good totals rather than flashing zeroes, which
              // would read as "you have earned nothing".
              .catch(() => {}),
      ])
    } finally {
      // Each run clears the flag it raised, superseded or not: guarding these
      // too would strand the OTHER flag when a refresh overtakes a plain load.
      if (isRefresh) setRefreshing(false)
      else setIsLoading(false)
    }
  }, [userId])

  // Mirrored into a ref so the focus callback's identity does NOT change when
  // the feed settles — that would re-fire the whole focus effect and turn the
  // first load into two.
  const feedFetchedRef = useRef(false)
  feedFetchedRef.current = transactions.hasFetched

  /**
   * Per-focus effect: fires ONCE per real focus (its deps are stable store
   * actions and a ref), so everything here is a genuine "the user arrived".
   *
   * Re-resolving the two UPSTREAM dependencies is the point. Both are fetched
   * once at startup by someone else — `refreshMe` from the sign-in / session
   * paths, the registry from useAppReady — and neither was ever retried, so a
   * single cold-start blip stuck for the whole session: the registry left every
   * balance read with zero chains to scan, which rendered as a settled
   * `0.00 USDC` with no rows, and only a force-close recovered it. Both actions
   * are self-de-duplicating (`ensureLoaded` joins an in-flight fetch and no-ops
   * on a usable registry; `refreshMe` keeps its last-good list on failure), so
   * re-firing per focus is cheap.
   */
  useFocusEffect(
    useCallback(() => {
      void refreshMe()
      void ensureChains()
      // The controller's own query effect owns page 0 (mount, and the gate
      // opening once the user id is known); every LATER focus has to re-read
      // it explicitly. Wallet is a tab, so it stays mounted — without this,
      // coming back after approving an escrow shows freshly-refetched lifetime
      // totals next to a transaction list that never learned about the row.
      // `reload` (not `refresh`) is the preserve-loaded-pages variant, so a
      // user who scrolled doesn't get yanked back to page 0.
      if (feedFetchedRef.current) void transactions.reload()
      // `transactions.reload` is stable (see usePaginatedList), and the flag is
      // read through a ref, so neither belongs in the dep list.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshMe, ensureChains]),
  )

  /**
   * Reactive effect: re-reads balances + totals on focus, and again whenever
   * their inputs settle (a landed refreshMe, a recovered registry).
   *
   * Separate from the effect above on purpose, in BOTH directions. The feed
   * reload must not sit here: `refreshMe` runs per focus and rewrites `wallets`
   * with a fresh array, so this effect re-runs, and a combined one would fire a
   * second, pointless page-0 request behind every focus. And the upstream
   * refetches must not sit here either, or they would re-trigger themselves
   * through that same identity change, forever.
   */
  useFocusEffect(
    useCallback(() => {
      void load(wallets, chains)
    }, [load, wallets, chains]),
  )

  const handleRefresh = useCallback(async () => {
    // Awaited together so a caller can't observe "refreshed" while half of it
    // is still in flight. The spinner itself is driven by the UNION of the two
    // refreshing flags (see the returned `refreshing`) — RefreshControl is a
    // controlled prop, so awaiting here alone would not keep it spinning.
    //
    // The upstream pair is refreshed HERE too, not just on focus: pull-to-refresh
    // is the gesture a user reaches for when the screen looks wrong, and it used
    // to re-read balances against the same stale wallet list and the same
    // unloaded registry that caused the wrong screen — visibly doing nothing.
    //
    // The registry gets the store's REAL `fetch`, not `ensureLoaded`: this is
    // the one user gesture that must refresh a registry that is stale but
    // usable (a pre-0G snapshot listing three chains is "usable"), and
    // ensureLoaded no-ops on exactly that — which left reinstalling the app as
    // the only way to pick up a newly enabled chain after a failed launch
    // fetch. `fetch` is self-de-duping and keeps the last good registry on
    // failure, so the worst a broken network does here is nothing.
    //
    // The balance read then uses what they just SETTLED, read from the stores
    // rather than from this callback's closure: a closure built before the
    // refresh still holds the stale wallet list and the unloaded registry, and
    // waiting for a re-render to fire the effect above would make the recovery
    // depend on render timing (a refresh whose state round-trips to where it
    // started does not reliably produce one).
    await Promise.all([refreshMe(), fetchChains()])
    const { wallets: freshWallets } = useAuthStore.getState()
    const { chains: freshChains } = useChainRegistryStore.getState()
    await Promise.all([transactions.refresh(), load(freshWallets, freshChains, true)])
    // `transactions.refresh` is stable (see usePaginatedList).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshMe, fetchChains])

  // Headline: USDC summed across every wallet×chain (one unit, exact base-units).
  const totalUsdcRaw = sumUsdcRaw(balances)
  const usdcAssetId = balances.find((b) => b.usdc)?.usdc?.assetId ?? 'USDC_SOL'
  const totalUsdc = amountRawToDisplay(totalUsdcRaw, usdcAssetId)

  const earnedUsdc = amountRawToDisplay(summary.earned_raw, summary.asset)
  const spentUsdc = amountRawToDisplay(summary.spent_raw, summary.asset)

  const feed = useMemo(
    () => groupByDay(transactions.items, (tx) => tx.created_at, (tx) => tx.id, 'tx'),
    [transactions.items],
  )

  // Which balance section the screen owes the user. Resolved from BOTH loads
  // (wallets and chain registry) — see resolveWalletSection for why collapsing
  // them is what produced a confident `0.00` over an unloaded registry.
  const section = resolveWalletSection({
    walletsStatus,
    hasWallet,
    chainsStatus,
    registryUsable: isRegistryUsable(chains),
  })

  return {
    user,
    /**
     * The single branch the screen renders (see WalletSectionState). It replaces
     * the raw `hasWallet` + `walletsStatus` pair the screen used to re-derive
     * for itself: two loads' worth of states resolved at the call site is how
     * "load failed" came to render as "no wallet linked", and how an unloaded
     * chain registry came to render as a real `0.00`.
     */
    section,
    /** Retry for `section === 'wallets-error'` (re-fetches the linked wallets). */
    retryWallets,
    /** Retry for `section === 'balances-unavailable'` (re-fetches the registry). */
    retryChains: ensureChains,
    balances,
    totalUsdc,
    earnedUsdc,
    spentUsdc,
    feed,
    /** Paging controls for the transaction feed (the screen renders `feed`). */
    loadMoreTransactions: transactions.loadMore,
    isLoadingMoreTransactions: transactions.isLoadingMore,
    isLoading,
    /**
     * The FEED's own first-page state, kept separate from `isLoading` (which
     * covers balances + totals). The screen needs both: `isLoading` drives the
     * hero skeleton, this one gates the "No transactions yet" empty state.
     * Conflating them would either spin the hero while only the feed loads, or
     * — the bug this fixes — declare the list empty as soon as the cheaper
     * summary request settled, flashing "No transactions yet" over a feed that
     * was still in flight. It reads false when the list is gated off (no user),
     * so a screen that will never fetch still reaches its empty state.
     */
    isLoadingTransactions: transactions.isLoading,
    // Union of both halves: pull-to-refresh must keep spinning until the feed
    // has landed too, not just the balances and totals.
    refreshing: refreshing || transactions.isRefreshing,
    handleRefresh,
  }
}
