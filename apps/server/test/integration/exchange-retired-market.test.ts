/**
 * POST /v1/exchange when the payout account's country is no longer a market.
 *
 * Retiring a market is commenting its spec out of PAYOUT_COUNTRY_SPECS, and the
 * accounts people already saved for it stay in the table. This is the route's
 * behaviour against one of those rows.
 *
 * Kept in its own file rather than appended to exchange-p2p.test.ts, which is
 * already 888 lines: the repo caps hand-maintained files at 300, and a test for
 * a distinct scenario is a poor reason to push an existing file further over.
 *
 * The row is created directly with an unserved country, which is exactly the
 * state retirement leaves behind — the POST route refuses to create one, so
 * going through it could not reach this case at all.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  createBankAccount,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** A country with no payout spec — what a retired market's rows look like. */
const RETIRED = 'ZW'

/**
 * The two failures are told apart because the fixes differ: an account we
 * cannot pay out to needs a different ACCOUNT, a currency mismatch needs a
 * different PRICE. Before the fallback was removed they were the same message,
 * and worse — an unserved country resolved to NGN, so this request SUCCEEDED
 * against an NGN-priced offer instead of failing.
 */
test('an offer backed by a retired-market account is refused by country', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const account = await createBankAccount(app, seller.row.id, { country: RETIRED })
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'draft',
  })

  const res = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(seller.token),
    payload: {
      escrow_id: escrow.id,
      fiat_amount: 15_000,
      fiat_currency: 'NGN',
      rate: 1_500,
      payout_account_id: account.id,
    },
  })

  assert.strictEqual(res.statusCode, 400)
  // The message names the COUNTRY, not the currency: naming the currency would
  // send the seller to change a price that was never the problem.
  assert.match(res.json().message, new RegExp(`not supported in '${RETIRED}'`))
})

/**
 * And a live market still resolves — otherwise the test above would pass for a
 * route that refused every offer, which is the shape a guard-ordering mistake
 * takes.
 */
test('an offer backed by a live-market account passes the country guard', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const account = await createBankAccount(app, seller.row.id, { country: 'NG' })
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'draft',
  })

  const res = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(seller.token),
    payload: {
      escrow_id: escrow.id,
      fiat_amount: 15_000,
      fiat_currency: 'NGN',
      rate: 1_500,
      payout_account_id: account.id,
    },
  })

  assert.strictEqual(res.statusCode, 201)
})
