/**
 * /v1/bank-accounts — multi-country, spec-driven payout accounts (T7).
 * Validation comes from the shared payout-spec registry; a bank and a
 * mobile-money account coexist via the `kind`-scoped uniqueness. Name-enquiry
 * is unconfigured in tests, so NG bank names are user-supplied.
 *
 * ONE SWEEP ITEM HERE IS DELIBERATELY NOT TESTED (#105 T1). The refusal in
 * routes/v1/bank-accounts — "account did not resolve, check the number" —
 * sits behind `if (enquiry !== null)`, and `buildNameEnquiry()` in lib/nip.ts
 * is currently `return null` with no branch: the vendor HTTP implementation is
 * not wired yet. So the guard is unreachable from ANY input, not merely
 * unconfigured in tests, and reaching it would mean faking the module rather
 * than exercising the product. It becomes testable when name-enquiry lands, and
 * that is where its case belongs. Triaged C (config-gated) in the sweep doc and
 * corrected to D (unreachable by construction) once the call path was read.
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

test('the same account saved twice is a 409, not a 500 from the constraint (#105 T1)', { skip }, async () => {
  // `(user, kind, bank_code, account_number)` is unique. Without the catch the
  // second save surfaces as a postgres unique violation — a 500 for what is
  // plainly a client-side duplicate.
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const body = {
    country: 'NG', bank_code: '058', account_number: '0123456700', account_name: 'TWICE OVER',
  }
  assert.strictEqual((await post(app, u.token, body)).statusCode, 201)

  const again = await post(app, u.token, body)
  assert.strictEqual(again.statusCode, 409)
  assert.match(again.json().message, /already saved/)
})

test('DELETE /v1/bank-accounts/:id: an id the caller does not own is 404 (#105 T1)', { skip }, async () => {
  // The store scopes the delete by user, so another user's id and a nonexistent
  // id are indistinguishable from outside — which is the point. Both 404 rather
  // than reporting whether the row exists.
  const app = getApp()
  const owner = await createUser(app, { country: 'NG' })
  const stranger = await createUser(app, { country: 'NG' })
  const created = await post(app, owner.token, {
    country: 'NG', bank_code: '058', account_number: '0123456711', account_name: 'OWNER ONLY',
  })
  assert.strictEqual(created.statusCode, 201)
  const id = created.json().id

  const foreign = await app.inject({
    method: 'DELETE', url: `/v1/bank-accounts/${id}`, headers: authHeader(stranger.token),
  })
  assert.strictEqual(foreign.statusCode, 404)
  assert.match(foreign.json().message, /bank account not found/)

  // A well-formed id that belongs to nobody answers identically — which is what
  // makes the 404 above scoping rather than a leak.
  const absent = await app.inject({
    method: 'DELETE', url: '/v1/bank-accounts/00000000-0000-0000-0000-000000000000',
    headers: authHeader(owner.token),
  })
  assert.strictEqual(absent.statusCode, 404)

  // ...and the owner can still delete it, so the 404s above were scoping, not a
  // broken route.
  const mine = await app.inject({
    method: 'DELETE', url: `/v1/bank-accounts/${id}`, headers: authHeader(owner.token),
  })
  assert.strictEqual(mine.statusCode, 200)
})

/**
 * AE stores the CANONICAL IBAN, not what was typed.
 *
 * `requireIban` accepts the grouped form people paste from their bank, so for
 * this rail the typed value and the value that identifies the account are
 * different strings. The route applies the rail's `normalizeAccountNumber`
 * before validating and inserting; without it the spaced string was stored,
 * which masked as "••  456" rather than the last four digits, and let the same
 * IBAN be saved twice — spaced and unspaced are two different values to the
 * (user_id, kind, bank_code, account_number) uniqueness constraint.
 */
test('AE bank: a grouped IBAN saves canonically and masks to the last four', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'AE' })
  const res = await post(app, u.token, {
    country: 'AE',
    bank_code: 'Emirates NBD',
    account_number: 'AE07 0331 2345 6789 0123 456',
    account_name: 'AHMED AL MANSOURI',
  })
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.json().account_number_masked, `${'\u2022'.repeat(19)} 3456`)
})

test('AE bank: the same IBAN spaced and unspaced is ONE account', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'AE' })
  const body = { country: 'AE', bank_code: 'Emirates NBD', account_name: 'AHMED AL MANSOURI' }

  const first = await post(app, u.token, { ...body, account_number: 'AE07 0331 2345 6789 0123 456' })
  assert.strictEqual(first.statusCode, 201)

  // The same account, typed without spaces and in lower case.
  const second = await post(app, u.token, { ...body, account_number: 'ae070331234567890123456' })
  assert.strictEqual(second.statusCode, 409, 'the duplicate was not recognised')
})

test('AE bank: a checksum-invalid IBAN is refused', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'AE' })
  // One transposed pair — the length is right, the mod-97 check is not.
  const res = await post(app, u.token, {
    country: 'AE',
    bank_code: 'Emirates NBD',
    account_number: 'AE070331234567890123465',
    account_name: 'AHMED AL MANSOURI',
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message ?? '', /IBAN is not valid/)
})

test('ZA and PH markets accept their own formats', { skip }, async () => {
  const app = getApp()
  const za = await createUser(app, { country: 'ZA' })
  const zaRes = await post(app, za.token, {
    country: 'ZA', bank_code: 'Capitec Bank', account_number: '1234567890', account_name: 'THANDI NKOSI',
  })
  assert.strictEqual(zaRes.statusCode, 201)

  const ph = await createUser(app, { country: 'PH' })
  const phRes = await post(app, ph.token, {
    country: 'PH', kind: 'mobile_money', bank_code: 'GCASH', account_number: '09171234567', account_name: 'MARIA SANTOS',
  })
  assert.strictEqual(phRes.statusCode, 201)
  assert.strictEqual(phRes.json().kind, 'mobile_money')
})

/**
 * WHITESPACE IS NOT A DIFFERENT ACCOUNT — on every rail, not just AE.
 *
 * `requireDigits` trims before it checks, so " 1234567890 " passes validation.
 * The digit rails declare no canonical form, so what got STORED was the padded
 * string: the mask still rendered (maskTail trims too), which is what hid it,
 * but the uniqueness constraint on (user_id, kind, bank_code, account_number)
 * saw two different values and saved the same account twice. For NG it is
 * worse than a duplicate row — name-enquiry is handed `account_number` before
 * validation, so a padded number is what would reach the vendor.
 */
test('a trailing space is the same account, not a second one', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'ZA' })
  const body = { country: 'ZA', bank_code: 'Capitec Bank', account_name: 'THANDI NKOSI' }

  const first = await post(app, u.token, { ...body, account_number: '1234567890' })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(first.json().account_number_masked, `${'\u2022'.repeat(6)} 7890`)

  const padded = await post(app, u.token, { ...body, account_number: ' 1234567890 ' })
  assert.strictEqual(padded.statusCode, 409, 'a padded number was stored as a second account')

  // The bank name is in the same unique tuple, so it is canonicalised too —
  // otherwise the identity is only half normalised and the hole stays open.
  const paddedBank = await post(app, u.token, {
    ...body, bank_code: '  Capitec Bank  ', account_number: '1234567890',
  })
  assert.strictEqual(paddedBank.statusCode, 409, 'a padded bank name was stored as a second account')
})
