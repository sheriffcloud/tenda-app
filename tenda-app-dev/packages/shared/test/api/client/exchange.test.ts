/**
 * exchangeApi / disputesApi — verb, route and payload per method.
 *
 * `disputes.mine` lives in this module rather than its own: it is caller-scoped
 * like /v1/conversations, identity coming from the JWT and not from a path
 * param, which is what keeps a dispute findable after its push notification is
 * gone.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import { createExchangeApi, createDisputesApi } from '../../../src/api/client/exchange'
import { assertLastCall, expectClientCall, recordingRequest, type ClientCase } from './harness'


const { request, calls } = recordingRequest()
const exchangeApi = createExchangeApi(request)
const disputesApi = createDisputesApi(request)
const { exchange, disputes } = apiRoutes

const CASES: ClientCase[] = [
  {
    name: 'exchange.list (query omitted)',
    call: () => exchangeApi.list(),
    method: 'GET',
    path: exchange.list,
    options: { query: undefined },
  },
  {
    name: 'exchange.list (query given)',
    call: () => exchangeApi.list({ currency: 'NGN', limit: 20 }),
    method: 'GET',
    path: exchange.list,
    options: { query: { currency: 'NGN', limit: 20 } },
  },
  {
    name: 'exchange.create',
    call: () =>
      exchangeApi.create({
        escrow_id: 'e1',
        fiat_amount: 75_000,
        fiat_currency: 'NGN',
        rate: 1500,
        payout_account_id: 'b1',
      }),
    method: 'POST',
    path: exchange.create,
    options: {
      body: {
        escrow_id: 'e1',
        fiat_amount: 75_000,
        fiat_currency: 'NGN',
        rate: 1500,
        payout_account_id: 'b1',
      },
    },
  },
  {
    name: 'exchange.get (scoped)',
    call: () => exchangeApi.get({ id: 'e1' }),
    method: 'GET',
    path: exchange.get,
    options: { params: { id: 'e1' } },
  },
  {
    name: 'disputes.mine (query given)',
    call: () => disputesApi.mine({ limit: 20 }),
    method: 'GET',
    path: disputes.mine,
    options: { query: { limit: 20 } },
  },
]

for (const testCase of CASES) {
  test(testCase.name, async () => {
    await expectClientCall(calls, testCase)
  })
}

test('the caller’s own disputes are NOT reached by a user id in the path', async () => {
  await disputesApi.mine()
  const [, path] = calls.at(-1) ?? []
  assert.equal(path, disputes.mine)
  assert.equal(String(path).includes(':id'), false)
})
