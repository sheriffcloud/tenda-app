import type { Metadata } from 'next'
import { APP_INFO, type ExchangeListQuery } from '@tenda/shared'
import ExchangePageClient from '@/components/exchange/ExchangePageClient'
import { listEnabledChains } from '@/lib/gigs/data'
import { listPublicOffersOnce } from '@/lib/exchange/public-data'
import { exchangeCurrency, exchangeHref, exchangeTab } from './market/copy'

export type ExchangeSearchParams = Record<string, string | string[] | undefined>

export async function readExchangeRoute(raw: ExchangeSearchParams) {
  const chains = await listEnabledChains()
  const chain = typeof raw.chain === 'string' && chains.some((item) => item.id === raw.chain)
    ? raw.chain
    : null
  return {
    tab: exchangeTab(typeof raw.tab === 'string' ? raw.tab : null),
    currency: exchangeCurrency(typeof raw.cur === 'string' ? raw.cur : null),
    chainId: chain,
  }
}

export async function generateExchangeMetadata({
  searchParams,
}: {
  searchParams: Promise<ExchangeSearchParams>
}): Promise<Metadata> {
  const route = await readExchangeRoute(await searchParams)
  const page = await listPublicOffersOnce(toQuery(route))
  return {
    title: 'Exchange',
    description: `Compare public crypto offers on ${APP_INFO.name}.`,
    alternates: { canonical: exchangeHref(route) },
    ...(page === null || route.tab === 'mine'
      ? { robots: { index: false, follow: true } }
      : {}),
  }
}

function toQuery(route: Awaited<ReturnType<typeof readExchangeRoute>>): Omit<ExchangeListQuery, 'limit' | 'offset'> {
  return {
    currency: route.currency ?? undefined,
    chain_id: route.chainId ?? undefined,
  }
}

export default async function PublicExchangePage({
  searchParams,
}: {
  searchParams: Promise<ExchangeSearchParams>
}) {
  const route = await readExchangeRoute(await searchParams)
  const page = await listPublicOffersOnce(toQuery(route))
  return <ExchangePageClient initialRoute={route} initialPage={page} />
}
