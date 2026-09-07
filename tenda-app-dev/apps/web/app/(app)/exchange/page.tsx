'use client'

/**
 * P2P exchange — the Tier-3 order book. Open to every signed-in user
 * (spec-correction #50, mobile parity + server decision #14: browsing and
 * accepting were always open on the wire; only web locked the page). The
 * book is still never public — both endpoints require auth.
 *
 * The page owns nothing but composition: the list state comes from the URL
 * and the surface renders it.
 */
import { useAuthStore } from '@/stores/auth.store'
import { useExchangeRoute } from '@/hooks/exchange/useExchangeRoute'
import { useExchangeScreen } from '@/hooks/exchange/useExchangeScreen'
import { ExchangeSurface } from '@/components/exchange/market'

export default function ExchangePage() {
  const user = useAuthStore((s) => s.user)
  const { route, chainReady } = useExchangeRoute()
  const screen = useExchangeScreen({
    currency: route.currency,
    chainId: route.chainId,
    enabled: chainReady,
  })

  return <ExchangeSurface route={route} screen={screen} userId={user?.id ?? ''} />
}
