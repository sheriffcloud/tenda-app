import type { Metadata } from 'next'
import { ExchangeDetailRoute } from '@/components/exchange/ExchangeDetailRoute'
import { getPublicOffer } from '@/lib/exchange/public-data'
import { exchangeHref } from '@/components/exchange/market/copy'
import {
  readExchangeRoute,
  type ExchangeSearchParams,
} from '@/components/exchange/PublicExchangePage'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await getPublicOffer(id)
  return {
    title: result.kind === 'ready' ? 'Exchange offer' : 'Offer unavailable',
    alternates: { canonical: `/exchange/${id}` },
    ...(result.kind === 'ready' ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function ExchangeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<ExchangeSearchParams>
}) {
  const [{ id }, route] = await Promise.all([
    params,
    searchParams.then(readExchangeRoute),
  ])
  const result = await getPublicOffer(id)
  return (
    <ExchangeDetailRoute
      id={id}
      initialOffer={result.kind === 'ready' ? result.offer : null}
      initialGone={result.kind === 'missing'}
      initialLoaded
      backHref={exchangeHref(route)}
    />
  )
}
