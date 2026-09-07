import { ActivityIndicator, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { typography } from '@/theme/tokens'
import { ScreenContainer, Text, Spacer, Header } from '@/components/ui'
import { RestrictionBanner } from '@/components/reputation'
import { FailedSyncPanel } from '@/components/sync/FailedSyncPanel'
import {
  TxRow,
  WalletHeroCard,
  EarningsSummary,
  WalletBalanceRows,
  WalletActions,
  WalletEmptyState,
  WalletLoadError,
} from '@/components/wallet'
import { useWalletScreen } from '@/hooks/useWalletScreen'
import { END_REACHED_THRESHOLD } from '@/lib/pagination'

export default function WalletScreen() {
  const { theme } = useUnistyles()
  const {
    user,
    section,
    retryWallets,
    retryChains,
    balances,
    totalUsdc,
    earnedUsdc,
    spentUsdc,
    feed,
    loadMoreTransactions,
    isLoadingMoreTransactions,
    isLoading,
    isLoadingTransactions,
    refreshing,
    handleRefresh,
  } = useWalletScreen()

  // One branch per settled fact, resolved in the hook (resolveWalletSection).
  // A failed load must NOT read as "no wallet linked", and an unreadable chain
  // registry must NOT read as a zero balance — those were the two bugs. While
  // either load is in flight the hero skeleton stands in.
  const walletSection =
    section === 'ready' ? (
      <>
        <WalletHeroCard totalUsdc={totalUsdc} isLoading={isLoading} />
        <WalletBalanceRows balances={balances} />
        <WalletActions />
        <EarningsSummary earnedUsdc={earnedUsdc} spentUsdc={spentUsdc} />
      </>
    ) : section === 'wallets-error' ? (
      <WalletLoadError variant="wallets" onRetry={retryWallets} />
    ) : section === 'balances-unavailable' ? (
      // Lifetime totals stay: they are server-computed and owe nothing to the
      // chain registry. Sell / cash-out does NOT — it derives its sellable
      // (chain, asset) options from that same registry, so offering it here
      // would land the user on an empty picker.
      <>
        <WalletLoadError variant="balances" onRetry={retryChains} />
        <EarningsSummary earnedUsdc={earnedUsdc} spentUsdc={spentUsdc} />
      </>
    ) : section === 'no-wallet' ? (
      <WalletEmptyState />
    ) : (
      // 'loading', and the fail-safe for any state added later: a skeleton
      // claims nothing, which is the only safe thing to render about money we
      // have not read yet.
      <WalletHeroCard totalUsdc={totalUsdc} isLoading />
    )

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right']}>
      <Header title="Wallet" variant="large" />
      <RestrictionBanner />
      <FlatList
        data={feed}
        keyExtractor={(item) => item.key}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.brand.primary}
            colors={[theme.colors.brand.primary]}
          />
        }
        ListHeaderComponent={
          <>
            <FailedSyncPanel />
            {walletSection}
            <Text style={[s.sectionTitle, { color: theme.colors.content.tertiary }]}>TRANSACTION HISTORY</Text>
          </>
        }
        renderItem={({ item }) =>
          item.type === 'day' ? (
            <Text style={[s.dayHeader, { color: theme.colors.content.tertiary }]}>{item.label.toUpperCase()}</Text>
          ) : (
            <TxRow tx={item.item} userId={user?.id ?? ''} />
          )
        }
        ListEmptyComponent={
          // Gated on the FEED's own load, not just `isLoading` (balances +
          // totals): the summary is the cheaper request and routinely settles
          // first, which used to flash "No transactions yet" over a feed that
          // was still fetching.
          !isLoading && !isLoadingTransactions ? (
            <Text size={13} color={theme.colors.content.tertiary} style={s.emptyText}>
              No transactions yet
            </Text>
          ) : null
        }
        onEndReached={loadMoreTransactions}
        onEndReachedThreshold={END_REACHED_THRESHOLD}
        ListFooterComponent={
          isLoadingMoreTransactions ? (
            <ActivityIndicator style={s.footer} color={theme.colors.brand.primary} />
          ) : (
            <Spacer size={32} />
          )
        }
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  content: { paddingTop: 4 },
  footer: { paddingVertical: 16 },
  sectionTitle: {
    fontFamily: typography.fonts.mono,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 1.0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  dayHeader: {
    fontFamily: typography.fonts.mono,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 1.0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  emptyText: { textAlign: 'center', paddingVertical: 24 },
})
