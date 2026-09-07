/**
 * users.is_seeker — the Solana Seeker DEVICE fee tier (selects seeker_fee_bps
 * on every escrow the user creates). Written ONCE by the signup bootstrap
 * (auth verify → orchestrator INSERT; pinned in auth-unified.test.ts).
 *
 * PATCH /v1/users/me used to accept it, letting any JWT self-assign the
 * discount from a form or a curl. The field is now dropped from the PATCH
 * surface — IGNORED, not rejected, because shipped mobile clients (≤ the fix)
 * still send it alongside the name fields and must keep succeeding.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('PATCH /v1/users/me: is_seeker is IGNORED, the old-client payload still succeeds', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })

  // The exact shape the pre-fix mobile profile-setup sent: names + the toggle.
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { first_name: 'Ada', last_name: 'Lovelace', is_seeker: true },
  })
  assert.strictEqual(res.statusCode, 200, 'old clients must not start failing')
  assert.strictEqual(res.json().user.is_seeker, false, 'the response must not echo an upgrade')

  const [row] = await app.db
    .select({ is_seeker: users.is_seeker })
    .from(users)
    .where(eq(users.id, u.row.id))
  assert.strictEqual(row.is_seeker, false, 'the fee tier must not be self-assignable')
})

test('PATCH /v1/users/me: a body of ONLY is_seeker is "no updatable fields" (422)', { skip }, async () => {
  // The negative half: the field is not merely defaulted somewhere — the route
  // no longer recognises it as updatable at all. No shipped client ever sent
  // it alone, so nothing breaks.
  const app = getApp()
  const u = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace', is_seeker: true })

  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { is_seeker: false },
  })
  assert.strictEqual(res.statusCode, 422)

  // And a legitimately-seeker row is untouched by the rejected write.
  const [row] = await app.db
    .select({ is_seeker: users.is_seeker })
    .from(users)
    .where(eq(users.id, u.row.id))
  assert.strictEqual(row.is_seeker, true)
})
