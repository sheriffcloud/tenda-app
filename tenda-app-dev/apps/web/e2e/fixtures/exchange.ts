import type {
  EscrowListRow,
  ExchangeDetail,
  ExchangeSummary,
  PaginatedResponse,
} from '@tenda/shared'
import { TRADER_USER_ID } from './auth'

/**
 * The order book, as two offers a reader can tell apart.
 *
 * Two currencies and two chains, so the filters have something to DO — a
 * fixture where every row matches every filter proves a chip changed the URL
 * and nothing else.
 *
 * Every row is scoped by the handler below, and `myEscrows` answers only the
 * CALLER's rows. That matters: the #17 review found a leak test that passed
 * because the fixture served its seeded conversation to any bearer, so the
 * probe measured the fixture rather than the app.
 */
const seller = {
  id: 'seller-ngn',
  first_name: 'Chioma',
  last_name: 'Eze',
  avatar_url: null,
  review_score: '4.70',
  is_seeker: false,
  is_agent: false,
  country: 'NG',
}

const kenyanSeller = {
  id: 'seller-kes',
  first_name: 'Wanjiru',
  last_name: 'Kamau',
  avatar_url: null,
  review_score: null,
  is_seeker: false,
  is_agent: false,
  country: 'KE',
}

export const ngnOffer: ExchangeSummary = {
  escrow_id: 'exch-ngn-1',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '50000000',
  status: 'open',
  fiat_amount: '75000.0000',
  fiat_currency: 'NGN',
  rate: '1500.0000000000',
  payment_window_seconds: 3600,
  accept_deadline: null,
  created_at: '2026-08-15T10:00:00.000Z',
  creator: seller,
}

export const kesOffer: ExchangeSummary = {
  ...ngnOffer,
  escrow_id: 'exch-kes-1',
  chain_id: 'eip155:84532',
  asset: 'USDC_BASE',
  fiat_amount: '6450.0000',
  fiat_currency: 'KES',
  rate: '129.0000000000',
  payment_window_seconds: 5400,
  creator: kenyanSeller,
}

export const OFFERS: ExchangeSummary[] = [ngnOffer, kesOffer]

/** The detail the offer page reads — an OUTSIDER's view: nothing party-scoped. */
export const ngnOfferDetail: ExchangeDetail = {
  ...ngnOffer,
  hidden: false,
  is_seeker: false,
  payment_proof_url: null,
  my_signer_address: null,
  dispute_bond_raw: '0',
  completion_deadline: null,
  submitted_at: null,
  approval_deadline: null,
  requires_approval: false,
  is_assigned: false,
  assigned_counterparty_id: null,
  counterparty: null,
  proofs: [],
  dispute: null,
  reviews: [],
  payout_account: null,
}

/** The trader's own trade, so "My trades" has a row that is really theirs. */
export const traderEscrow: EscrowListRow = {
  id: 'exch-mine-1',
  kind: 'exchange',
  status: 'accepted',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '25000000',
  // NULL for every exchange — this is `gig_details.title` on the wire.
  title: null,
  fiat_currency: 'NGN',
  creator_id: TRADER_USER_ID,
  counterparty_id: 'someone-else',
  accept_deadline: null,
  created_at: '2026-08-14T10:00:00.000Z',
}

interface StubReply {
  statusCode: number
  payload: unknown
}

function page<T>(data: T[]): PaginatedResponse<T> {
  return { data, total: data.length, limit: 20, offset: 0 }
}

/**
 * `/v1/exchange`, `/v1/exchange/:id` and the caller's own exchange escrows.
 * Returns null for anything else so the caller falls through.
 */
export function handleExchange(
  url: URL,
  method: string,
  userId: string,
  enabledChainIds: readonly string[],
): StubReply | null {
  /**
   * The real route refuses a chain the deployment does not serve
   * (`lib/chain-filter.ts` — a 400, never a silently empty page). The stub
   * mirrors it so the client's own narrowing is what the e2e measures: if the
   * app ever forwards a stale `?chain=` again, this answers the way the server
   * would and the test that expects a full book fails.
   */
  const refuseUnknownChain = (chain: string | null): StubReply | null =>
    chain === null || enabledChainIds.includes(chain)
      ? null
      : {
          statusCode: 400,
          payload: {
            statusCode: 400,
            error: 'Bad Request',
            message: `chain_id must be one of: ${enabledChainIds.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        }

  if (url.pathname === '/v1/exchange' && method === 'GET') {
    const currency = url.searchParams.get('currency')
    const chain = url.searchParams.get('chain_id')
    const refused = refuseUnknownChain(chain)
    if (refused !== null) return refused
    let data = OFFERS
    if (currency !== null) data = data.filter((offer) => offer.fiat_currency === currency)
    if (chain !== null) data = data.filter((offer) => offer.chain_id === chain)
    return { statusCode: 200, payload: page(data) }
  }

  const detail = url.pathname.match(/^\/v1\/exchange\/([^/]+)$/)
  if (detail !== null && method === 'GET') {
    if (detail[1] === ngnOfferDetail.escrow_id) {
      return { statusCode: 200, payload: ngnOfferDetail }
    }
    return {
      statusCode: 404,
      payload: {
        statusCode: 404,
        error: 'Not Found',
        message: 'offer is not available',
        code: 'NOT_FOUND',
      },
    }
  }

  const escrows = url.pathname.match(/^\/v1\/users\/([^/]+)\/escrows$/)
  if (escrows !== null && method === 'GET') {
    // Scoped to the CALLER, like the real route: asking for somebody else's
    // escrows is a refusal, not a different list.
    if (escrows[1] !== userId) {
      return {
        statusCode: 403,
        payload: {
          statusCode: 403,
          error: 'Forbidden',
          message: 'not your escrows',
          code: 'FORBIDDEN',
        },
      }
    }
    const chain = url.searchParams.get('chain_id')
    const refused = refuseUnknownChain(chain)
    if (refused !== null) return refused
    const mine = userId === TRADER_USER_ID ? [traderEscrow] : []
    return {
      statusCode: 200,
      payload: page(chain === null ? mine : mine.filter((row) => row.chain_id === chain)),
    }
  }

  return null
}
