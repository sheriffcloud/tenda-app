import {
  apiRoutes,
  type CreateExchangeDetailsBody,
  type ExchangeDetail,
  type ExchangeDetailsRow,
  type ExchangeListQuery,
  type ExchangeSummary,
  type MyDisputeRow,
  type MyDisputesQuery,
  type PaginatedResponse,
} from '@tenda/shared'
import { request } from '../request'

const { exchange, disputes } = apiRoutes

export const exchangeApi = {
  list: (query?: ExchangeListQuery) =>
    request<PaginatedResponse<ExchangeSummary>>('GET', exchange.list, { query }),
  // CO4: attach offer terms to a draft escrow (create flow step 2).
  create: (body: CreateExchangeDetailsBody) =>
    request<ExchangeDetailsRow>('POST', exchange.create, { body }),
  get: (params: { id: string }) => request<ExchangeDetail>('GET', exchange.get, { params }),
}

// Party-facing dispute list (the caller's own disputes) — keeps a dispute
// findable after its push notification is dismissed.
export const disputesApi = {
  mine: (query?: MyDisputesQuery) =>
    request<PaginatedResponse<MyDisputeRow>>('GET', disputes.mine, { query }),
}
