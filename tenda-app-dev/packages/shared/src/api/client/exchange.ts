import { apiRoutes } from '../routes'
import type {
  CreateExchangeDetailsBody,
  ExchangeDetail,
  ExchangeDetailsRow,
  ExchangeListQuery,
  ExchangeSummary,
  MyDisputeRow,
  MyDisputesQuery,
  PaginatedResponse,
} from '../..'
import type { ApiRequest } from './types'

const { exchange, disputes } = apiRoutes

export function createExchangeApi(request: ApiRequest) {
  return {
    list: (query?: ExchangeListQuery) =>
      request<PaginatedResponse<ExchangeSummary>>('GET', exchange.list, { query }),
    // CO4: attach offer terms to a draft escrow (create flow step 2).
    create: (body: CreateExchangeDetailsBody) =>
      request<ExchangeDetailsRow>('POST', exchange.create, { body }),
    get: (params: { id: string }) => request<ExchangeDetail>('GET', exchange.get, { params }),
  }
}

// Party-facing dispute list (the caller's own disputes) — keeps a dispute
// findable after its push notification is dismissed.
export function createDisputesApi(request: ApiRequest) {
  return {
    mine: (query?: MyDisputesQuery) =>
      request<PaginatedResponse<MyDisputeRow>>('GET', disputes.mine, { query }),
  }
}
