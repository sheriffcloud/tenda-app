import type {
  BankAccountSummary,
  FiatIntentDetail,
  FiatQuoteResponse,
} from '@tenda/shared'
import { errorEnvelope, json, type StubResponse } from './reply'

/**
 * The cash-out world: one payout account, a quote that is always fresh, and an
 * intent that can be fetched and cancelled.
 *
 * The quote's `expires_at` is computed per REQUEST rather than fixed, because
 * the surface refuses to submit an expired quote — a frozen timestamp would
 * make every e2e run either always-valid or always-expired depending on when
 * the fixture was written.
 */
export const PAYOUT_ACCOUNT: BankAccountSummary = {
  id: 'acc-ng-1',
  country: 'NG',
  kind: 'bank',
  bank_code: '058',
  account_number_masked: '••••6789',
  account_name: 'Tunde Bello',
  is_default: true,
  verified: true,
  created_at: '2026-08-01T00:00:00.000Z',
}

export const INTENT_ID = 'int-e2e-1'

/** Mutable so the cancel route can move it, and a reload can see the move. */
// `awaiting_user` is where a fresh offramp lands and the state that is
// CANCELLABLE (`isCancellable` = quoted | awaiting_user), so the fixture can
// exercise the cancel path rather than asserting a button that never renders.
const world = { status: 'awaiting_user' as FiatIntentDetail['status'] }

export function resetFiatWorld(): void {
  world.status = 'awaiting_user'
}

function intent(): FiatIntentDetail {
  return {
    id: INTENT_ID,
    direction: 'offramp',
    status: world.status,
    provider: 'rail-x',
    fiat_currency: 'NGN',
    fiat_amount: '75000.0000',
    asset: 'USDC_SOL',
    asset_amount_raw: '50000000',
    rate: '1500.0000000000',
    fee_amount: '250.0000',
    kyc_required: false,
    kyc_url: null,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    instruction: { kind: 'ussd', code: '*737*50*1#' },
    created_at: '2026-08-18T09:00:00.000Z',
  }
}

function quote(): FiatQuoteResponse {
  return {
    intent_id: INTENT_ID,
    provider: 'rail-x',
    rate: 1500,
    fee_amount: 250,
    fiat_amount: 74_750,
    asset_amount_raw: '50000000',
    kyc_required: false,
    // Always genuinely fresh: the surface refuses an expired quote, and a
    // fixed timestamp would decide that outcome by the calendar.
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }
}

/** `/v1/fiat/*` — quote, offramp, intent read and cancel, payout accounts. */
export function handleFiat(url: URL, method: string): StubResponse | null {
  // `/v1/bank-accounts`, NOT under /v1/fiat — read off `apiRoutes.fiat`
  // rather than guessed from the client method's name.
  if (url.pathname === '/v1/bank-accounts' && method === 'GET') {
    return json([PAYOUT_ACCOUNT])
  }
  if (url.pathname === '/v1/fiat/quote' && method === 'POST') {
    return json(quote())
  }
  if (url.pathname === '/v1/fiat/offramp' && method === 'POST') {
    return json({ intent_id: INTENT_ID, instruction: intent().instruction })
  }

  const cancel = url.pathname.match(/^\/v1\/fiat\/intents\/([^/]+)\/cancel$/)
  if (cancel !== null && method === 'POST') {
    if (cancel[1] !== INTENT_ID) return errorEnvelope(404, 'Not Found', 'no such intent', 'NOT_FOUND')
    world.status = 'cancelled'
    return json({ cancelled: true })
  }

  const detail = url.pathname.match(/^\/v1\/fiat\/intents\/([^/]+)$/)
  if (detail !== null && method === 'GET') {
    if (detail[1] !== INTENT_ID) return errorEnvelope(404, 'Not Found', 'no such intent', 'NOT_FOUND')
    return json(intent())
  }

  return null
}
