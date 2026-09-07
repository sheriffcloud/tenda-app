import { View, StyleSheet, Pressable } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { SlidersHorizontal, X } from 'lucide-react-native'
import { spacing, radius } from '@/theme/tokens'
import { Text, Spacer, EmptyState, Button, PaginatedList } from '@/components/ui'
import { ExchangeOfferCard } from './ExchangeOfferCard'
import { OfferListSkeleton } from './OfferListSkeleton'
import type { ExchangeSummary } from '@tenda/shared'
import type { PaginatedListState } from '@/hooks/usePaginatedList'

/**
 * Market page (open offers): the currency filter over a paginated list.
 *
 * The chain chip row is NOT here — it lives in the screen shell, outside the
 * pager, because a horizontal ScrollView nested in the horizontal pager never
 * received its own pans (swiping the chips switched tabs). It also applies to
 * both tabs, so one instance is correct.
 */
export function ExchangeMarketPage({
  width,
  currency,
  list,
  onOpenFilter,
  onClearCurrency,
}: {
  width: number
  currency: string | null
  list: PaginatedListState<ExchangeSummary>
  onOpenFilter: () => void
  onClearCurrency: () => void
}) {
  const { theme } = useUnistyles()

  return (
    <View style={{ width }}>
      <View style={[s.filterRow, { borderBottomColor: theme.colors.border.subtle }]}>
        <Pressable
          style={[s.filterBtn, { backgroundColor: theme.colors.surface.backgroundAlt }]}
          onPress={onOpenFilter}
        >
          <SlidersHorizontal size={13} color={theme.colors.content.secondary} />
          <Text variant="caption" weight="medium" color={theme.colors.content.secondary}>
            {currency ?? 'All currencies'}
          </Text>
        </Pressable>
        {currency && (
          <Pressable hitSlop={8} onPress={onClearCurrency}>
            <X size={16} color={theme.colors.content.secondary} />
          </Pressable>
        )}
      </View>

      <PaginatedList<ExchangeSummary>
        list={list}
        keyOf={(offer) => offer.escrow_id}
        renderItem={({ item }) => <ExchangeOfferCard offer={item} showStatus={false} />}
        contentContainerStyle={s.list}
        separatorHeight={spacing.sm}
        onRefresh={() => void list.refresh()}
        skeleton={<OfferListSkeleton />}
        errorState={
          <View style={s.center}>
            <Text color={theme.colors.feedback.danger.text}>{list.error}</Text>
            <Spacer size={spacing.sm} />
            <Button variant="outline" size="sm" onPress={() => void list.refresh()}>
              Retry
            </Button>
          </View>
        }
        empty={
          <EmptyState
            title="No open offers"
            description={
              currency
                ? `No open ${currency} offers right now`
                : 'Check back soon for new offers'
            }
          />
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  list: { padding: spacing.md, paddingBottom: spacing['2xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
})
