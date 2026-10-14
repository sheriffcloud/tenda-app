'use client'

/**
 * Wallet screen data controller (web port of apps/mobile/hooks/
 * useWalletScreen.ts). Drives off the authoritative linked-wallet list and
 * the chain registry — never a single connected address. Owns the
 * per-(wallet,chain) balances, the summed-USDC headline, the paginated
 * transaction feed, and the USDC lifetime earned/spent totals (a server SQL
 * aggregate — never reduced from feed pages, open_issues MB1).
 *
 * Focus semantics differ from mobile on purpose: a Next route unmounts on
 * navigation, so "the user arrived" is mount, and an explicit Refresh action
 * replaces pull-to-refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  amountRawToDisplay,
  groupByDay,
  isRegistryUsable,
  resolveWalletSection,
  sumUsdcRaw,
  readWalletBalances,
  type ChainRegistryEntry,
  type LinkedWallet,
  type UserEscrowTransaction,
  type UserTransactionsQuery,
  type UserTransactionsSummary,
  type WalletChainBalance,
} from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'

const EMPTY_SUMMARY: UserTransactionsSummary = {
  earned_raw: '0',
  spent_raw: '0',
  asset: 'USDC_SOL',
}

const txKey = (tx: UserEscrowTransaction) => tx.id

export function useWalletScreen() {
  const user = useAuthStore((s) => s.user)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const refreshWallets = useAuthStore((s) => s.refreshWallets)
  const chains = useChainRegistryStore((s) => s.chains)
  const chainsStatus = useChainRegistryStore((s) => s.status)
  const ensureChains = useChainRegistryStore((s) => s.ensureLoaded)

  const [balances, setBalances] = useState<WalletChainBalance[]>([])
  const [summary, setSummary] = useState<UserTransactionsSummary>(EMPTY_SUMMARY)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const userId = user?.id ?? null

  const transactions = usePaginatedList<UserEscrowTransaction, UserTransactionsQuery>({
    fetchPage: (params) => api.users.transactions({ id: userId ?? '' }, params),
    query: {},
    keyOf: txKey,
    enabled: userId !== null,
  })

  // Discards the writes of a `load` a newer one has already superseded —
  // linking/unlinking re-fires the read while an earlier one is in flight,
  // and the older answer must not land last (mobile's guard, verbatim).
  const loadRunRef = useRef(0)

  const load = useCallback(
    async (
      forWallets: readonly Pick<LinkedWallet, 'chain_ns' | 'address'>[],
      forChains: readonly ChainRegistryEntry[] | null,
      isRefresh = false,
    ) => {
      const runId = (loadRunRef.current += 1)
      const isCurrent = () => runId === loadRunRef.current

      if (isRefresh) setRefreshing(true)
      else setIsLoading(true)
      try {
        // allSettled so one failure (an RPC hiccup, a summary blip) can't
        // wedge the screen or hide the other half of it.
        await Promise.allSettled([
          readWalletBalances(forWallets, forChains ?? [])
            .then((read) => {
              if (isCurrent()) setBalances(read)
            })
            .catch(() => {
              if (isCurrent()) setBalances([])
            }),
          userId === null
            ? Promise.resolve(setSummary(EMPTY_SUMMARY))
            : api.users
                .transactionsSummary({ id: userId })
                .then((fresh) => {
                  if (isCurrent()) setSummary(fresh)
                })
                // Keep the last good totals rather than flashing zeroes.
                .catch(() => {}),
        ])
      } finally {
        if (isRefresh) setRefreshing(false)
        else setIsLoading(false)
      }
    },
    [userId],
  )

  // Mount = arrival: re-resolve both upstream dependencies (both are
  // self-de-duplicating, so this is cheap and heals a cold-start blip).
  useEffect(() => {
    void refreshWallets()
    void ensureChains()
  }, [refreshWallets, ensureChains])

  // Reactive: re-read balances + totals whenever the inputs settle.
  useEffect(() => {
    void load(wallets, chains)
  }, [load, wallets, chains])

  const handleRefresh = useCallback(async () => {
    // Refresh the upstreams FIRST, then read the values they just settled
    // from the stores (a closure built before the refresh cannot see them).
    await Promise.all([refreshWallets(), ensureChains()])
    const { wallets: freshWallets } = useAuthStore.getState()
    const { chains: freshChains } = useChainRegistryStore.getState()
    await Promise.all([transactions.refresh(), load(freshWallets, freshChains, true)])
    // `transactions.refresh` is stable (see usePaginatedList).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshWallets, ensureChains])

  const totalUsdcRaw = sumUsdcRaw(balances)
  const usdcAssetId = balances.find((b) => b.usdc)?.usdc?.assetId ?? 'USDC_SOL'
  const totalUsdc = amountRawToDisplay(totalUsdcRaw, usdcAssetId)
  const earnedUsdc = amountRawToDisplay(summary.earned_raw, summary.asset)
  const spentUsdc = amountRawToDisplay(summary.spent_raw, summary.asset)

  const feed = useMemo(
    () => groupByDay(transactions.items, (tx) => tx.created_at, (tx) => tx.id, 'tx'),
    [transactions.items],
  )

  const section = resolveWalletSection({
    walletsStatus,
    hasWallet: wallets.length > 0,
    chainsStatus,
    registryUsable: isRegistryUsable(chains),
  })

  return {
    user,
    section,
    retryWallets: refreshWallets,
    retryChains: ensureChains,
    balances,
    totalUsdc,
    earnedUsdc,
    spentUsdc,
    feed,
    loadMoreTransactions: transactions.loadMore,
    hasMoreTransactions: transactions.hasMore,
    isLoadingMoreTransactions: transactions.isLoadingMore,
    isLoading,
    isLoadingTransactions: transactions.isLoading,
    // The SERVER total, so the Activity count says how many transactions
    // exist rather than how many this page happens to be holding.
    totalTransactions: transactions.total,
    refreshing: refreshing || transactions.isRefreshing,
    handleRefresh,
  }
}
