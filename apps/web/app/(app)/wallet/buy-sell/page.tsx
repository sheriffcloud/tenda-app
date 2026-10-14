'use client'

/**
 * Sell crypto — the route keeps the `/wallet/buy-sell` path even though there
 * is no Buy: it is mobile's path, and the wallet's own action row and any
 * saved link point at it. Renaming it would break them for a word nobody sees.
 * Onramp was retired in #61 (spec-correction #1).
 */
import { useSearchParams } from 'next/navigation'
import { SellSurface, sellMode } from '@/components/wallet/sell'

export default function SellPage() {
  const search = useSearchParams()
  return <SellSurface mode={sellMode(search.get('mode'))} />
}
