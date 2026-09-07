/**
 * fiatApi — verb, route and payload per method.
 *
 * The bank-account trio is why this file exists: their paths are `/v1/bank-
 * accounts`, NOT `/v1/fiat/bank-accounts`, and getting that wrong is a 404
 * that type-checks. It was caught by hand during #19; now it is caught here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import { createFiatApi } from '../../../src/api/client/fiat'
import { assertLastCall, expectClientCall, recordingRequest, type ClientCase } from './harness'


const { request, calls } = recordingRequest()
const fiatApi = createFiatApi(request)
const { fiat } = apiRoutes
const id = { id: 'intent-1' }

const CASES: ClientCase[] = [
  {
    name: 'quote',
    call: () =>
      fiatApi.quote({
        direction: 'onramp',
        fiat_currency: 'NGN',
        fiat_amount: 75_000,
        asset: 'USDC_SOL',
        chain_id: 'solana:devnet',
        wallet_address: 'SoL1',
      }),
    method: 'POST',
    path: fiat.quote,
    options: {
      body: {
        direction: 'onramp',
        fiat_currency: 'NGN',
        fiat_amount: 75_000,
        asset: 'USDC_SOL',
        chain_id: 'solana:devnet',
        wallet_address: 'SoL1',
      },
    },
  },
  {
    name: 'onramp',
    call: () => fiatApi.onramp({ intent_id: 'i1' }),
    method: 'POST',
    path: fiat.onramp,
    options: { body: { intent_id: 'i1' } },
  },
  {
    name: 'offramp',
    call: () => fiatApi.offramp({ intent_id: 'i1', bank_account_id: 'b1' }),
    method: 'POST',
    path: fiat.offramp,
    options: { body: { intent_id: 'i1', bank_account_id: 'b1' } },
  },
  { name: 'intent (scoped)', call: () => fiatApi.intent(id), method: 'GET', path: fiat.intent, options: { params: id } },
  {
    name: 'cancelIntent (scoped)',
    call: () => fiatApi.cancelIntent(id),
    method: 'POST',
    path: fiat.cancelIntent,
    options: { params: id },
  },
  { name: 'bankAccounts', call: () => fiatApi.bankAccounts(), method: 'GET', path: fiat.bankAccounts },
  {
    name: 'createBankAccount',
    call: () => fiatApi.createBankAccount({ country: 'NG', bank_code: '058', account_number: '0123456789' }),
    method: 'POST',
    path: fiat.createBankAccount,
    options: { body: { country: 'NG', bank_code: '058', account_number: '0123456789' } },
  },
  {
    name: 'deleteBankAccount (scoped)',
    call: () => fiatApi.deleteBankAccount({ id: 'b1' }),
    method: 'DELETE',
    path: fiat.deleteBankAccount,
    options: { params: { id: 'b1' } },
  },
]

for (const testCase of CASES) {
  test(testCase.name, async () => {
    await expectClientCall(calls, testCase)
  })
}

test('bank accounts hang off /v1/bank-accounts, NOT under /v1/fiat', () => {
  // Stated as its own assertion because the surrounding module is named `fiat`
  // and every neighbouring path does start /v1/fiat — the reason the wrong
  // prefix looked right for as long as it did.
  assert.equal(fiat.bankAccounts, '/v1/bank-accounts')
  assert.equal(fiat.createBankAccount, '/v1/bank-accounts')
  assert.equal(fiat.deleteBankAccount, '/v1/bank-accounts/:id')
})
