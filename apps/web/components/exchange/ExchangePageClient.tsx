'use client'

import type { ExchangeSummary, PaginatedResponse } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useSessionBootstrap } from '@/hooks/auth/useSessionBootstrap'
import { useExchangeRoute } from '@/hooks/exchange/useExchangeRoute'
import { useExchangeScreen } from '@/hooks/exchange/useExchangeScreen'
import { ExchangeSurface, type ExchangeRouteState } from '@/components/exchange/market'

export default function ExchangePageClient({
  initialRoute,
  initialPage,
}: {
  initialRoute: ExchangeRouteState
  initialPage: PaginatedResponse<ExchangeSummary> | null
}) {
  useSessionBootstrap()
  const user = useAuthStore((state) => state.user)
  const { route, chainReady } = useExchangeRoute()
  const sameRoute = JSON.stringify(route) === JSON.stringify(initialRoute)
  const screen = useExchangeScreen({
    currency: route.currency,
    chainId: route.chainId,
    enabled: chainReady,
    initialPage: sameRoute && initialPage !== null ? initialPage : undefined,
  })
  return <ExchangeSurface route={route} screen={screen} userId={user?.id ?? null} readFailed={initialPage === null} />
}
