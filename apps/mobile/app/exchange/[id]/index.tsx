/**
 * Exchange detail (cutover §6 rewrite): read surface over /v1/exchange/:id
 * (escrows kind='exchange' ⨝ exchange_details). The loader lives in
 * useExchangeDetail; the body + transition wiring is ExchangeDetailContent.
 */
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScreenContainer, EmptyState } from '@/components/ui'
import { LoadingScreen, ErrorState } from '@/components/feedback'
import { ExchangeDetailContent } from '@/components/exchange/ExchangeDetailContent'
import { useExchangeDetail } from '@/hooks/useExchangeDetail'
import { useAuthStore } from '@/stores'

export default function ExchangeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { offer, isLoading, error, refresh } = useExchangeDetail(id)

  if (isLoading && !offer) return <LoadingScreen />

  // `gone` skips the retry state: the offer was deleted, or taken down and no
  // longer readable by this viewer, so Retry would fail every time.
  if (error && !error.gone && !offer) {
    return (
      <ScreenContainer>
        <ErrorState title="Failed to load offer" description={error.message} ctaLabel="Retry" onCtaPress={() => void refresh()} />
      </ScreenContainer>
    )
  }

  if (!offer) {
    return (
      <ScreenContainer>
        <EmptyState
          title="Offer not available"
          description="This offer may have been removed, or is no longer public."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </ScreenContainer>
    )
  }

  return <ExchangeDetailContent offer={offer} userId={user?.id ?? ''} refresh={refresh} />
}
