/**
 * What each surface answers for an account that NO LONGER EXISTS (#105 T4, #108).
 *
 * Split out of auth-refusals.test.ts when that file passed 300 lines, and it is
 * the better home anyway: these cases share one mechanism and one setup, and
 * three of them exist only because of it.
 *
 * THE MECHANISM. `authenticate` loads the user row and answers 401 'User no
 * longer exists' when it is gone — which is why a naive probe (create, delete,
 * request) never reaches anything further, and why the handlers' own guards read
 * as unreachable. IT CACHES: status and role are kept for STATUS_CACHE_TTL_MS
 * and the DB read is skipped on a hit. So a user who has made ONE authenticated
 * request and is then deleted passes `authenticate` from cache for the rest of
 * the minute, and whatever reads the database NEXT is the first to notice. That
 * is not exotic — an account deleted or hard-purged by an admin while its
 * session is live hits it on the very next request.
 *
 * So every case here is a claim about ORDER AND STATE, and one probe samples one
 * state. The last case runs BOTH, because it is the one where the answer changes
 * with the state rather than merely arriving from a different line.
 *
 * COLD, all four routes give the same answer, because it is the same preHandler
 * answering: 401 'User no longer exists'. WARM is where they diverge, and that
 * is what each case below asserts:
 *   users/me          401 'user no longer exists'   (the handler's own copy)
 *   PATCH users/me    401 'user no longer exists'   (from UPDATE … RETURNING)
 *   auth/me           404 'user not found'
 *   POST /v1/escrows  401 'User no longer exists'   (a second preHandler)
 * The first two differ from the cold answer only in capitalisation, so every
 * assertion pins the message rather than the status. The escrows case runs BOTH
 * arms, because there the answer arrives from a different guard.
 *
 * auth/me's 404 is the odd one out and is deliberately left alone: it is not a
 * guard's answer but a handler's, and it is pinned here rather than changed.
 * The escrows row read 403 PROFILE_INCOMPLETE until #117 — the guard now
 * separates "your account is gone" from "your profile is unfinished", and the
 * case after it holds the 403 arm so the split cannot silently become a
 * blanket 401.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import type { LightMyRequestResponse } from 'fastify'
import { users } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  authHeader,
  createUser,
  useTestApp,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/**
 * A user whose row is gone but whose `authenticate` cache entry is still warm —
 * the state the header describes, and the setup for every case below.
 *
 * My first reading of this tranche recorded all three of the guards below as
 * shadowed, on a probe that had a cold cache. That is the whole reason this
 * helper exists rather than a plain create-delete-request.
 */
async function deletedButCached(app: ReturnType<typeof getApp>): Promise<string> {
  const u = await createUser(app)
  // The warming request. Without it the preHandler answers and the guard under
  // test never runs — this line IS the test setup, not a sanity check.
  const warm = await app.inject({ method: 'GET', url: '/v1/users/me', headers: authHeader(u.token) })
  assert.strictEqual(warm.statusCode, 200, 'the warming request must succeed')
  await app.db.delete(users).where(eq(users.id, u.row.id))
  return u.token
}

test('GET /v1/users/me: a user deleted mid-session is 401 from the HANDLER', { skip }, async () => {
  const app = getApp()
  const token = await deletedButCached(app)

  const res = await app.inject({ method: 'GET', url: '/v1/users/me', headers: authHeader(token) })
  assert.strictEqual(res.statusCode, 401)
  // Lower case: the handler's copy, not the preHandler's 'User no longer exists'.
  assert.strictEqual(res.json().message, 'user no longer exists')
})

test('PATCH /v1/users/me: the update returns no row and is 401', { skip }, async () => {
  // A different guard from the one above — this one reads the result of an
  // UPDATE ... RETURNING rather than a SELECT, so a row deleted between the
  // preHandler and the write lands here. Without it the route would return
  // `{ user: undefined }` with a 200.
  const app = getApp()
  const token = await deletedButCached(app)

  const res = await app.inject({
    method: 'PATCH', url: '/v1/users/me', headers: authHeader(token),
    payload: { first_name: 'Ada' },
  })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(res.json().message, 'user no longer exists')
})

test('GET /v1/auth/me: a user deleted mid-session is 404, not 401', { skip }, async () => {
  // Deliberately different from its users/me twin, and worth pinning BECAUSE it
  // is inconsistent: the same condition answers 401 UNAUTHORIZED on one route
  // and 404 USER_NOT_FOUND on the other. A client that treats 401 as "re-login"
  // and 404 as "not found" behaves differently on two routes describing the
  // same event. Pinned as-is rather than silently harmonised — changing a status
  // is a wire change, and this tranche is about executing refusals, not
  // redesigning them.
  const app = getApp()
  const token = await deletedButCached(app)

  const res = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: authHeader(token) })
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json().message, 'user not found')
  // The literal, not ErrorCode.USER_NOT_FOUND: this pins the WIRE value a client
  // branches on. Asserting the enum against itself could not fail.
  assert.strictEqual(res.json().code, 'USER_NOT_FOUND')

  // THE POSITIVE CONTROL, and it was missing until the coverage walk found it:
  // auth/me's success `return user` was executed by NO test in the suite, so a
  // route that 404ed for everyone satisfied the assertions above. Its users/me
  // twin is covered by other suites; this route had nothing.
  const live = await createUser(app)
  const ok = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: authHeader(live.token) })
  assert.strictEqual(ok.statusCode, 200, ok.body)
  assert.strictEqual(ok.json().id, live.row.id)
})

/** POST /v1/escrows as `token` — the route whose handler guard is at stake. */
function createEscrowAs(
  app: ReturnType<typeof getApp>,
  token: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(token),
    payload: createEscrowBody(),
  })
}

test('POST /v1/escrows: a deleted account is refused by a PREHANDLER, cold or warm', { skip }, async () => {
  // The counter-example to the three cases above, and the correction #108 was
  // filed for. escrows/index.ts:55 is the create HANDLER's own 'user no longer
  // exists' guard, and unlike users/me and auth/me it is unreachable in BOTH
  // cache states — that route carries three preHandlers, not one:
  //
  //   cold → 401 'User no longer exists', from `authenticate`
  //   warm → 401 'User no longer exists', from `requireProfileComplete`
  //
  // The warm arm USED to be 403 PROFILE_INCOMPLETE, because that guard tested
  // `row === undefined || !hasCompleteName(...)` and a missing row left by the
  // same door as a blank name. #117 split them: a gone account invalidates the
  // SESSION, not the profile, so both cache states now give the answer
  // `authenticate` gives cold — and the deleted-account holder is no longer told
  // to finish signing up.
  //
  // Both arms run here, because "an earlier guard answers" is a claim about
  // ORDER AND STATE and one arm samples one state — the mistake auth-refusals
  // .test.ts's closing note records, made twice on these very lines.
  const app = getApp()

  const cold = await createUser(app)
  await app.db.delete(users).where(eq(users.id, cold.row.id))
  const coldRes = await createEscrowAs(app, cold.token)
  assert.strictEqual(coldRes.statusCode, 401, coldRes.body)
  assert.strictEqual(coldRes.json().message, 'User no longer exists')

  const warmRes = await createEscrowAs(app, await deletedButCached(app))
  assert.strictEqual(warmRes.statusCode, 401, warmRes.body)
  assert.strictEqual(warmRes.json().code, 'UNAUTHORIZED')
  assert.strictEqual(warmRes.json().message, 'User no longer exists')

  // THE CONTROL: a live account with a complete name gets past both guards to a
  // third answer, so the two refusals above are caused by the deletion rather
  // than by the route turning everyone away.
  const live = await createUser(app)
  const liveRes = await createEscrowAs(app, live.token)
  assert.strictEqual(liveRes.statusCode, 403, liveRes.body)
  assert.strictEqual(liveRes.json().code, 'WALLET_REQUIRED')
})

test('POST /v1/escrows: an INCOMPLETE name still gets 403, so the split is a split', { skip }, async () => {
  // The other arm, and the case that makes the one above mean something. If
  // `requireProfileComplete` had simply been changed to 401 throughout, every
  // assertion in the previous test would still pass while a half-registered
  // LIVE user was wrongly logged out. These two only hold together.
  //
  // Whitespace rather than empty strings, because that is what `hasCompleteName`
  // is for — the column is NOT NULL and a client can send spaces.
  const app = getApp()
  const blank = await createUser(app, { first_name: '  ', last_name: 'Lovelace' })

  const res = await createEscrowAs(app, blank.token)
  assert.strictEqual(res.statusCode, 403, res.body)
  assert.strictEqual(res.json().code, 'PROFILE_INCOMPLETE')
  assert.match(res.json().message, /Complete your profile/)
})
