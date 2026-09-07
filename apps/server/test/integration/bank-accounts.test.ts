/**
 * /v1/bank-accounts — multi-country, spec-driven payout accounts (T7).
 * Validation comes from the shared payout-spec registry; a bank and a
 * mobile-money account coexist via the `kind`-scoped uniqueness. Name-enquiry
 * is unconfigured in tests, so NG bank names are user-supplied.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

function post(app: ReturnType<typeof getApp>, token: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/v1/bank-accounts', headers: authHeader(token), payload })
}

test('NG bank: valid account saves with kind=bank and a 4-tail mask', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await post(app, u.token, {
    country: 'NG', bank_code: '058', account_number: '0123456789', account_name: 'ADAEZE OKOYE', is_default: true,
  })
  assert.strictEqual(res.statusCode, 201)
  const body = res.json()
  assert.strictEqual(body.kind, 'bank')
  assert.strictEqual(body.account_number_masked, '•••••• 6789')
  assert.strictEqual(body.verified, false)
})

test('kind defaults to bank when omitted', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await post(app, u.token, {
    country: 'NG', bank_code: '058', account_number: '0123456780', account_name: 'NO KIND',
  })
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.json().kind, 'bank')
})

test('GH mobile money: MTN account saves with kind=mobile_money and a 3-tail mask', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'GH' })
  const res = await post(app, u.token, {
    country: 'GH', kind: 'mobile_money', bank_code: 'MTN', account_number: '0241234567', account_name: 'KWAME MENSAH',
  })
  assert.strictEqual(res.statusCode, 201)
  const body = res.json()
  assert.strictEqual(body.kind, 'mobile_money')
  assert.strictEqual(body.account_number_masked, '••••••• 567')
})

test('a bank and a MoMo account with the same number both persist (kind-scoped uniqueness)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'GH' })
  const a = await post(app, u.token, {
    country: 'GH', kind: 'bank', bank_code: 'GCB Bank', account_number: '0241234567', account_name: 'KWAME MENSAH',
  })
  const b = await post(app, u.token, {
    country: 'GH', kind: 'mobile_money', bank_code: 'MTN', account_number: '0241234567', account_name: 'KWAME MENSAH',
  })
  assert.strictEqual(a.statusCode, 201)
  assert.strictEqual(b.statusCode, 201)
})

test('NG bank: a non-10-digit number is rejected 422 via the spec', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await post(app, u.token, {
    country: 'NG', bank_code: '058', account_number: '012345678', account_name: 'SHORT NUM',
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /Account number/)
})

test('GH MoMo: an unknown network is rejected 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'GH' })
  const res = await post(app, u.token, {
    country: 'GH', kind: 'mobile_money', bank_code: 'PAYPAL', account_number: '0241234567', account_name: 'X',
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /Network/)
})

test('an unsupported payout country is rejected 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await post(app, u.token, {
    country: 'US', bank_code: '021000021', account_number: '12345678', account_name: 'US USER',
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /not supported/)
})

test('NG has no mobile-money rail → 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await post(app, u.token, {
    country: 'NG', kind: 'mobile_money', bank_code: 'MTN', account_number: '0241234567', account_name: 'X',
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /not available/)
})

test('an invalid kind value is rejected 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await post(app, u.token, {
    country: 'NG', kind: 'crypto', bank_code: '058', account_number: '0123456789', account_name: 'X',
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /kind/)
})

test('GET lists saved accounts with kind + masked number', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'GH' })
  await post(app, u.token, {
    country: 'GH', kind: 'mobile_money', bank_code: 'TELECEL', account_number: '0201234567', account_name: 'AMA OWUSU',
  })
  const res = await app.inject({ method: 'GET', url: '/v1/bank-accounts', headers: authHeader(u.token) })
  assert.strictEqual(res.statusCode, 200)
  const rows = res.json()
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].kind, 'mobile_money')
  assert.strictEqual(rows[0].account_number_masked, '••••••• 567')
})
