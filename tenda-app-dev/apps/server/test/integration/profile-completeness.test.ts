/**
 * "Has this user got a name?" — asked in three places, and it has to answer the
 * same way in all three (#47).
 *
 *   requireProfileComplete   lib/guards.ts       gates posting and accepting
 *   profile_complete         GET/PATCH users/me  drives mobile's redirect
 *   the stored value         PATCH write paths   what the other two read
 *
 * All three used to test presence with `=== ''`, and `'  '` passes that. A row
 * holding two spaces therefore cleared the create/accept guard, reported
 * `profile_complete: true`, skipped profile setup — and rendered "Anonymous" on
 * every surface, because the DISPLAY layer trims (`formatFullName`, #31) and
 * the gates did not. The two halves disagreed about the same row.
 *
 * The shipped app never wrote such a row (both mobile screens trim before
 * sending), so this is about what the API permits rather than a bug users hit.
 * That is still worth closing: the API is the contract, and rows can arrive
 * from a direct call, an older client, or a seed.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  authHeader,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** Two spaces in both columns — the shape every `=== ''` check waved through. */
const BLANK = { first_name: '  ', last_name: '  ' }

// ---------- the create/accept guard ---------------------------------------

test('POST /v1/escrows: 403 PROFILE_INCOMPLETE for a whitespace-only name', { skip }, async () => {
  // The consequence that matters most. This guard is what clears a user to post
  // and to accept work, so before the fix a blank-named account could take on a
  // counterparty who saw nothing but "Anonymous" for the whole trade.
  const app = getApp()
  const u = await createUser(app, BLANK)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(u.token),
    payload: createEscrowBody(),
  })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'PROFILE_INCOMPLETE')
})

test('POST /v1/escrows: a blank SURNAME alone is still incomplete', { skip }, async () => {
  // Both parts are required, which is why the predicate is not
  // `formatFullName(...) !== ''` — that returns 'Ada' here and would let this
  // through, disagreeing with the guard the client is trying to predict.
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: '   ' })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(u.token),
    payload: createEscrowBody(),
  })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'PROFILE_INCOMPLETE')
})

// ---------- profile_complete on the wire ----------------------------------

test('GET /v1/users/me: profile_complete is false for a whitespace-only name', { skip }, async () => {
  // What mobile redirects on. `true` here sends the user to the home screen
  // instead of profile setup, and then the guard above refuses their first gig.
  const app = getApp()
  const u = await createUser(app, BLANK)
  const res = await app.inject({
    method: 'GET',
    url: '/v1/users/me',
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().profile_complete, false)
})

test('GET /v1/users/me: profile_complete is true for a real name', { skip }, async () => {
  // The positive half — without it, a predicate hardwired to `false` passes
  // every other assertion in this file.
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  const res = await app.inject({
    method: 'GET',
    url: '/v1/users/me',
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.json().profile_complete, true)
})

// ---------- the write paths -----------------------------------------------

test('PATCH /v1/users/me: a whitespace-only name is stored empty, not as spaces', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { first_name: '  ', last_name: '  ' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().profile_complete, false)

  // The COLUMN, not just the response: the row is what every later read sees,
  // and leaving spaces there would keep the hole open for anything that has not
  // been converted to the shared predicate.
  const [row] = await app.db
    .select({ first_name: users.first_name, last_name: users.last_name })
    .from(users)
    .where(eq(users.id, u.row.id))
  assert.strictEqual(row.first_name, '')
  assert.strictEqual(row.last_name, '')
})

test('PATCH /v1/users/me: padding around a real name is trimmed off', { skip }, async () => {
  // The case that actually happens: a phone keyboard appends a space after
  // autocomplete. Nobody reports it, and it sits in the name forever.
  const app = getApp()
  const u = await createUser(app, BLANK)
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { first_name: ' Ada ', last_name: ' Lovelace ' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().user.first_name, 'Ada')
  assert.strictEqual(res.json().user.last_name, 'Lovelace')
  assert.strictEqual(res.json().profile_complete, true)
})

test('PATCH /v1/users/me: the length cap applies BEFORE trimming', { skip }, async () => {
  // Pins WHICH string the bound measures — the one sent, not the trimmed one.
  // Not a safety property (the columns are `text`, unbounded, and measuring the
  // trimmed value would cap storage just as well); it is the 422 this route has
  // always returned, and moving the check would silently start accepting these.
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { first_name: `${'a'.repeat(100)}  ` },
  })
  assert.strictEqual(res.statusCode, 422)
})

test('PATCH /v1/users/:id: trims names too — the other door to the same column', { skip }, async () => {
  // Two self-service routes write first_name/last_name. Fixing one leaves the
  // hole open through the other, and nothing about the fixed route would say so.
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  const res = await app.inject({
    method: 'PATCH',
    url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token),
    payload: { first_name: '  ', last_name: ' Lovelace ' },
  })
  assert.strictEqual(res.statusCode, 200)

  const [row] = await app.db
    .select({ first_name: users.first_name, last_name: users.last_name })
    .from(users)
    .where(eq(users.id, u.row.id))
  assert.strictEqual(row.first_name, '')
  assert.strictEqual(row.last_name, 'Lovelace')
})

test('PATCH /v1/users/:id: a null name is a 422, not a 500 and not a silent no-op', { skip }, async () => {
  // The column is NOT NULL, so a null here has never been storable. It used to
  // reach Postgres and come back a 500; routing it through `optionalName`
  // without this check would have answered 200 for a write that did not happen,
  // which is worse — the client is told it worked. MEASURED both ways before
  // this landed: 500 before, 200-and-ignored with a bare `?.trim()`.
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })
  const res = await app.inject({
    method: 'PATCH',
    url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token),
    payload: { first_name: null },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /first_name/)

  const [row] = await app.db
    .select({ first_name: users.first_name })
    .from(users)
    .where(eq(users.id, u.row.id))
  assert.strictEqual(row.first_name, 'Ada', 'the rejected write must not have landed')
})

test('PATCH /v1/users/:id: the length cap applies here too', { skip }, async () => {
  // This route had NO name validation before — an over-long name went straight
  // to the column while the same body was a 422 on /v1/users/me. One validator
  // now, so the two routes cannot disagree about what they accept.
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'PATCH',
    url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token),
    payload: { first_name: 'a'.repeat(101) },
  })
  assert.strictEqual(res.statusCode, 422)
})
