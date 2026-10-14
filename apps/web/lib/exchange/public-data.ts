import { cache } from 'react'
import {
  ApiClientError,
  PAGE_SIZE,
  type ExchangeDetail,
  type ExchangeListQuery,
  type ExchangeSummary,
  type PaginatedResponse,
} from '@tenda/shared'
import { api } from '@/api/client'

export type PublicOfferResult =
  | { kind: 'ready'; offer: ExchangeDetail }
  | { kind: 'missing' }
  | { kind: 'error' }

const listByKey = cache(async (key: string): Promise<PaginatedResponse<ExchangeSummary> | null> => {
  try {
    const page = await api.exchange.list(JSON.parse(key) as ExchangeListQuery)
    return Array.isArray(page?.data) ? page : null
  } catch {
    return null
  }
})

export function listPublicOffersOnce(
  query: Omit<ExchangeListQuery, 'limit' | 'offset'>,
): Promise<PaginatedResponse<ExchangeSummary> | null> {
  return listByKey(JSON.stringify({ ...query, limit: PAGE_SIZE, offset: 0 }))
}

export const getPublicOffer = cache(async (id: string): Promise<PublicOfferResult> => {
  try {
    return { kind: 'ready', offer: await api.exchange.get({ id }) }
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) return { kind: 'missing' }
    return { kind: 'error' }
  }
})
