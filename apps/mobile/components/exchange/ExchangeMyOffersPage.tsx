import { View, StyleSheet } from 'react-native'
import { spacing } from '@/theme/tokens'
import { EmptyState, PaginatedList } from '@/components/ui'
import { MyOfferRow } from './MyOfferRow'
import { OfferListSkeleton } from './OfferListSkeleton'
import type { EscrowListRow } from '@tenda/shared'
import type { PaginatedListState } from '@/hooks/usePaginatedList'

/**
 * "My Trades" page — the current user's exchange escrows on BOTH sides: offers
 * they posted (selling) and offers they accepted (buying). Without the buying
 * side a matched buyer loses the trade the moment they leave its detail screen,
 * as the market tab only lists still-open offers.
 *
 * The chain chip row lives in the screen shell, outside the pager — see
 * ExchangeMarketPage for why.
 */
export function ExchangeMyOffersPage({
  width,
  list,
  currentUserId,
  onPostOffer,
}: {
  width: number
  list: PaginatedListState<EscrowListRow>
  currentUserId: string | null
  onPostOffer: () => void
}) {
  return (
    <View style={{ width }}>
      <PaginatedList<EscrowListRow>
        list={list}
        keyOf={(row) => row.id}
        renderItem={({ item }) => (
          <MyOfferRow
            offer={item}
            side={item.creator_id === currentUserId ? 'selling' : 'buying'}
          />
        )}
        contentContainerStyle={s.list}
        separatorHeight={spacing.sm}
        onRefresh={() => void list.refresh()}
        skeleton={<OfferListSkeleton />}
        empty={
          <EmptyState
            title="No trades yet"
            description="Post a sell offer or accept one from the market to see it here"
            action={{ label: 'Post offer', onPress: onPostOffer }}
          />
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: spacing['2xl'] },
})
