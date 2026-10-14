/**
 * Exchange order-book surface. BROWSING IS ANONYMOUS since #179 — `list` and
 * `get` answer a caller with no token at all, like `/v1/gigs`; ACCEPTING still
 * needs a session, and advanced_mode_enabled gates offer CREATION only
 * (decision #14, settled 2026-06-05, its browse half knowingly reversed).
 * `get` serves a stranger the listing and withholds the private half — the
 * payout account, the counterparty, the evidence. Exchanges are escrows
 * (kind='exchange'); the chain-agnostic core and transitions live in
 * escrows.contract; `create` attaches the exchange_details satellite to a
 * draft (CO4).
 */
import type { Endpoint } from '../endpoint'
import type {
  ExchangeSummary,
  ExchangeDetail,
  ExchangeListQuery,
  CreateExchangeDetailsBody,
  ExchangeDetailsRow,
} from '../../types'
import type { PaginatedResponse } from '../../types/api'

export interface ExchangeContract {
  list: Endpoint<'GET', undefined, undefined, ExchangeListQuery, PaginatedResponse<ExchangeSummary>>
  create: Endpoint<'POST', undefined, CreateExchangeDetailsBody, undefined, ExchangeDetailsRow>
  get: Endpoint<'GET', { id: string }, undefined, undefined, ExchangeDetail>
}
