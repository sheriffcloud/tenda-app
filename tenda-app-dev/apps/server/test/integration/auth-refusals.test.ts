/**
 * Auth refusals that no test executed (#105 T4).
 *
 * Eight of the tranche's thirteen are reachable and are closed: FIVE here (the
 * two strategy seams share one case), and THREE in deleted-account-refusals
 * .test.ts, which took the cases sharing the status-cache setup when this file
 * passed 300 lines — it carries a fourth case that is #108's, not the
 * tranche's. The other five refusals are defensive, unreachable-by-construction
 * or race-only, and are recorded at the end of this file rather than faked.
 *
 * Each case asserts the MESSAGE as well as the status. This surface answers
 * 400/401/422 from several places — often with near-identical wording — so the
 * status alone cannot say which guard fired, and the message is what a client
 * can act on.
 *
 * The two strategy cases are at the SEAM. `buildAuthStrategies` returns a map
 * keyed by method and the routes dispatch through it, so a strategy can never
 * receive a proof of the wrong kind by that route — but the strategies are
 * exported and a second caller would not have that guarantee. Testing them here
 * is testing them where they can actually be reached, which is the same
 * reasoning #99 used for `p2pFulfilment.open`.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { buildAuthStrategies } from '@server/lib/auth/registry'
import type { AppError } from '@server/lib/errors'
import {
  ABSENT_UUID,
  TEST_CHAIN_ID,
  TEST_DB_CONFIGURED,
  createUser,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('POST /v1/auth/challenge: a missing identifier is 422, naming the field', { skip }, async () => {
  // The method is checked first and was covered; the identifier check beside it
  // was not. Both refuse, so only the message says which.
  const app = getApp()

  for (const identifier of [undefined, '', 42, null]) {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/challenge', payload: { method: 'email', identifier },
    })
    assert.strictEqual(res.statusCode, 422, String(identifier))
    assert.match(res.json().message, /identifier is required/)
  }
})

test('POST /v1/auth/verify: an identifier the channel cannot normalise is 422', { skip }, async () => {
  // `normalizeIdentifier` is what turns a typed address or number into the
  // canonical form the OTP was issued against. When it cannot, the request must
  // stop — otherwise the lookup runs against a value that can never match, and
  // the caller sees "wrong code" for what is a malformed address.
  const app = getApp()

  for (const identifier of ['not-an-email', 'a@', '@b.com', 'plain text']) {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/verify',
      payload: { method: 'email', identifier, code: '123456' },
    })
    assert.strictEqual(res.statusCode, 422, identifier)
    assert.match(res.json().message, /invalid email identifier/)
  }
})

test('GET /v1/users/:id/standing: a well-formed id for nobody is 404', { skip }, async () => {
  // The param guard rejects a malformed uuid before the handler; this is the
  // other half — a syntactically valid id that belongs to no user. Public route,
  // so it is also the answer an unauthenticated prober gets.
  const app = getApp()

  const absent = await app.inject({ method: 'GET', url: `/v1/users/${ABSENT_UUID}/standing` })
  assert.strictEqual(absent.statusCode, 404)
  assert.match(absent.json().message, /user not found/)

  // ...and a real user resolves, so the 404 is the lookup and not a broken route.
  const u = await createUser(app)
  const found = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/standing` })
  assert.strictEqual(found.statusCode, 200)
})

// ---------- strategy seams ----------------------------------------------------

test('auth strategies: each refuses a proof of the wrong KIND', { skip }, async () => {
  // An internal invariant, and the reason it is worth pinning: the strategies
  // are a map keyed by method, and the only thing making the key agree with the
  // proof's discriminant is the route that looks one up and passes the other.
  // If those two ever disagree, the OTP strategy would read `identifier` off a
  // wallet proof and the wallet strategy would try to verify a signature that is
  // not there. These refuse instead, and nothing ran either.
  const app = getApp()
  // The registry type allows a method to be ABSENT — that is how an unconfigured
  // OAuth provider is represented. otp and wallet are unconditional, so this
  // narrows rather than casts, and it would fail loudly if that ever changed.
  const { email, wallet } = buildAuthStrategies(app)
  assert.ok(email !== undefined, 'the email strategy is unconditional')
  assert.ok(wallet !== undefined, 'the wallet strategy is unconditional')

  const is500 = (err: AppError): boolean => {
    assert.strictEqual(err.statusCode, 500)
    return true
  }

  await assert.rejects(
    email.verify({
      method: 'wallet',
      chain_id: TEST_CHAIN_ID,
      address: 'SolWallet1111111111111111111111111111111',
      message: 'msg',
      signature: 'sig',
    }),
    (err: AppError) => is500(err) && /otp strategy received a non-otp proof/.test(err.message),
  )

  await assert.rejects(
    wallet.verify({ method: 'email', identifier: 'a@b.com', code: '123456', user_id: null }),
    (err: AppError) => is500(err) && /wallet strategy received a non-wallet proof/.test(err.message),
  )
})

/**
 * NOT COVERED, and recorded rather than forced — the remaining five, which the
 * post-run lcov confirms are still the only unexecuted refusals in these files:
 *
 *   auth/verify:56  `parseProof`'s switch `default:`. The route validates with
 *                   `isAuthMethod` first and answers 400 'unknown auth method'
 *                   (measured), and `parseProof` is module-private, so nothing
 *                   can hand it an unvalidated method. Its real job is
 *                   EXHAUSTIVENESS: it fires the day `AuthMethod` gains a sixth
 *                   member and the switch is not extended. Unreachable today by
 *                   construction; delete it and that safety net goes with it.
 *
 *   auth/link-wallet:90  the `inserted.length === 0` arm. NOT the guard that
 *                   answers a repeat link — line 71 does that, a case-insensitive
 *                   pre-check throwing 409 with the IDENTICAL message, and it was
 *                   already covered. Line 90 is the race loser: two requests that
 *                   both pass the pre-check before either insert, settled by the
 *                   (chain_ns, address) UNIQUE constraint. There is no gap between
 *                   the two predicates to exploit — case-insensitive is strictly
 *                   broader than the exact unique — so reaching it needs a real
 *                   interleaving, which a test can only make likely, not certain.
 *                   MEASURED: a test asserting the duplicate-link 409 SURVIVES
 *                   neutering line 90 entirely, because line 71 answers first.
 *                   That test was written for this tranche and then deleted; a
 *                   flaky race case would be worse than this note.
 *
 *   lib/auth/orchestrator.ts 214, 238, 246
 *                   'user insert returned no row', 'identity race winner not
 *                   found', 'resolved user row missing'. 500s guarding states
 *                   the database cannot produce for a caller: an INSERT ...
 *                   RETURNING that returns nothing, and a row that vanishes
 *                   between two statements. Reaching them means breaking the
 *                   database, not exercising the product.
 *
 * THREE MORE ALMOST JOINED THIS LIST. My first reading put users/me:61,
 * users/me:116 and auth/me:23 here, on the strength of a probe showing
 * `authenticate` answering first. The probe had a COLD status cache; warm, the
 * guards are reachable, and they are closed in deleted-account-refusals.test.ts.
 * The lesson is that "an earlier guard answers" is a claim about ORDER AND
 * STATE, and a single probe samples one state of it.
 *
 * Which is why the generalisation from those three is NOT made. escrows/index:55
 * is the same-looking guard and IS unreachable — for a reason nobody had run.
 * The first correction (#108) swapped one shadow for another and was wrong too:
 * BOTH guards shadow it, one per cache state, measured by that file's last case
 * rather than argued here.
 */
