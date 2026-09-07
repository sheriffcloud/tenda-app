import { useRef, useState } from 'react'
import { StyleSheet, ScrollView, Animated, useWindowDimensions } from 'react-native'
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { useRouter } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { ScreenContainer, Header } from '@/components/ui'
import { PagerTabBar } from '@/components/navigation'
import { ChainFilterChips } from '@/components/filters'
import { spacing } from '@/theme/tokens'
import {
  ExchangeMarketPage,
  ExchangeMyOffersPage,
  CurrencyFilterSheet,
} from '@/components/exchange'
import { useAuthStore } from '@/stores'
import { useExchangeScreen } from '@/hooks/useExchangeScreen'

export default function ExchangeScreen() {
  const { width: SW } = useWindowDimensions()
  const router        = useRouter()
  const user          = useAuthStore((s) => s.user)

  const { market, myTrades, currency, chainId, setCurrency, setChainId } = useExchangeScreen()

  const [pageIndex, setPageIndex]                 = useState(0)
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false)

  const scrollRef = useRef<ScrollView>(null)
  const scrollX   = useRef(new Animated.Value(0)).current

  // Tab switching is presentation only — each list controller owns its own
  // fetching, so no loader is called from here (that double-fetched before).
  function scrollToPage(index: number) {
    setPageIndex(index)
    scrollRef.current?.scrollTo({ x: index * SW, animated: true })
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SW)
    if (index !== pageIndex) setPageIndex(index)
  }

  function handleCurrencySelect(cur: string) {
    setCurrency(currency === cur ? null : cur)
    setCurrencySheetOpen(false)
  }

  const postOffer = () =>
    router.push('/wallet/buy-sell?mode=offer' as Parameters<typeof router.push>[0])

  return (
    <ScreenContainer scroll={false} padding={false}>
      <Header
        variant="large"
        title="Trade"
        subtitle="Swap crypto with sellers"
        // Post a P2P sell offer — available to all users (the create screen
        // gates on having a linked wallet, not on advanced mode).
        rightIcon={Plus}
        onRightPress={postOffer}
      />

      <PagerTabBar
        tabs={[
          { key: 'market', label: 'Market' },
          // Omitted until loaded — a "0" chip before the first response reads
          // as "you have no trades" rather than "still loading".
          { key: 'mine', label: 'My Trades', count: myTrades.hasFetched ? myTrades.total : undefined },
        ]}
        activeIndex={pageIndex}
        scrollX={scrollX}
        pageWidth={SW}
        onTabPress={scrollToPage}
      />

      {/*
        Outside the pager, deliberately. Nested inside it — as a list header on
        each page — this row is a horizontal ScrollView inside a horizontal
        pagingEnabled ScrollView, so the pager claimed every pan and swiping the
        chips switched tabs instead. Hoisting also collapses what were two
        instances of one control: `chainId` filters both tabs.
      */}
      <ChainFilterChips value={chainId} onChange={setChainId} gutterX={spacing.md} />

      {/* Swipeable pages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={handleScrollEnd}
        style={s.pager}
      >
        <ExchangeMarketPage
          width={SW}
          currency={currency}
          list={market}
          onOpenFilter={() => setCurrencySheetOpen(true)}
          onClearCurrency={() => setCurrency(null)}
        />
        <ExchangeMyOffersPage
          width={SW}
          list={myTrades}
          currentUserId={user?.id ?? null}
          onPostOffer={postOffer}
        />
      </ScrollView>

      <CurrencyFilterSheet
        visible={currencySheetOpen}
        onClose={() => setCurrencySheetOpen(false)}
        currency={currency}
        onSelect={handleCurrencySelect}
      />
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  pager: { flex: 1 },
})
