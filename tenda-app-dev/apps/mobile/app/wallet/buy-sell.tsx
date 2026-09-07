import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenContainer, Header, SegmentedTabs, type SegmentTab } from '@/components/ui'
import { InstantSellTab, OfferSellTab } from '@/components/wallet/sell'
import { spacing } from '@/theme/tokens'

const TABS: readonly SegmentTab[] = [
  { key: 'instant', label: 'Instant' },
  { key: 'offer', label: 'Create offer' },
]

/**
 * Sell crypto for fiat — one screen, two tabs: Instant (market-rate cash-out via
 * offramp) and Create offer (your own rate, a P2P sell offer). Unifies the two
 * previously-disjoint surfaces (the FAB cash-out and the Trade "+"). The
 * `?mode` param deep-links a tab; the route path stays `/wallet/buy-sell` so
 * existing links keep working. Buy (onramp) is retired (#61).
 */
export default function SellScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string }>()
  const [mode, setMode] = useState<string>(params.mode === 'offer' ? 'offer' : 'instant')

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Sell crypto" showBack onBackPress={() => router.back()} />
      <View style={s.tabs}>
        <SegmentedTabs tabs={TABS} value={mode} onChange={setMode} />
      </View>
      {mode === 'offer' ? <OfferSellTab /> : <InstantSellTab />}
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  tabs: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
})
