/**
 * Stage 9A — POST /v1/auth/challenge + /v1/auth/verify end-to-end against the
 * real app + DB. Adversarial-first: unknown method, malformed identifier,
 * wrong/expired code, wallet find-or-reject, block-on-collision, cross-method
 * email dedup, suspended gate, and the link (bearer) vs login (anon) split.
 *
 * OTP codes are hashed at rest, so we seed `auth_otps` rows directly with a
 * known code (via the real hashOtpCode) rather than scraping the console sender.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { auth_otps, user_identities, user_wallets, users } from '@tenda/shared/db/schema'
import { hashOtpCode, type OtpChannel } from '@server/lib/otp'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  FAKE_BAD_SIGNATURE,
  useTestApp,
  createUser,
  resetDb,
} from '../helpers/test-app'
import { walletFixture } from '../helpers/fixtures'
import { issueNonce, buildAuthMessage } from '../helpers/auth-message'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
type App = ReturnType<typeof getApp>

const GOOD_SIG = 'sig:ok'
const CODE = '424242'

beforeEach(async () => {
  if (!skip) await resetDb(getApp())
})

let seq = 0
const uniqPhone = (): string => `+23480${String((seq += 1)).padStart(8, '0')}`
const uniqEmail = (): string => `u${(seq += 1)}@example.com`
let addrSeq = 0
const freshAddress = (): string => `SolUnifiedWallet${(addrSeq += 1)}1111111111111111111`

async function seedOtp(
  app: App,
  args: { channel: OtpChannel; identifier: string; user_id: string | null; code?: string },
): Promise<void> {
  await app.db.insert(auth_otps).values({
    channel: args.channel,
    identifier: args.identifier,
    user_id: args.user_id,
    code_hash: hashOtpCode(args.code ?? CODE),
    expires_at: new Date(Date.now() + 10 * 60_000),
  })
}

function verify(app: App, payload: Record<string, unknown>, token?: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/verify',
    headers: token !== undefined ? { authorization: `Bearer ${token}` } : {},
    payload,
  })
}

function challenge(app: App, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/v1/auth/challenge', payload })
}

/** Sign in (or create) via a freshly-signed wallet message through /auth/verify. */
async function walletVerify(app: App, address: string, over: Record<string, unknown> = {}) {
  const { nonce, issued_at } = await issueNonce(app)
  const message = buildAuthMessage({ address, nonce, issued_at })
  return verify(app, {
    method: 'wallet',
    chain_id: TEST_CHAIN_ID,
    address,
    message,
    signature: GOOD_SIG,
    ...over,
  })
}

// ---------- challenge --------------------------------------------------------

test('challenge: phone + email issue an OTP (202); wallet/unknown rejected', { skip }, async () => {
  const app = getApp()
  const phone = uniqPhone()
  const r1 = await challenge(app, { method: 'phone', identifier: phone })
  assert.strictEqual(r1.statusCode, 202)
  assert.ok(typeof r1.json().expires_in === 'number')
  const rows = await app.db.select().from(auth_otps)
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].channel, 'phone')

  assert.strictEqual((await challenge(app, { method: 'email', identifier: uniqEmail() })).statusCode, 202)
  // Wallet challenges via /auth/nonce, not here.
  assert.strictEqual((await challenge(app, { method: 'wallet', identifier: 'x' })).statusCode, 400)
  assert.strictEqual((await challenge(app, { method: 'nope', identifier: 'x' })).statusCode, 400)
  // Malformed identifier per channel.
  assert.strictEqual((await challenge(app, { method: 'phone', identifier: 'not-a-phone' })).statusCode, 422)
})

// ---------- verify: login / create ------------------------------------------

test('verify phone: anon creates then logs in (is_new flips)', { skip }, async () => {
  const app = getApp()
  const phone = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: phone, user_id: null })
  const created = await verify(app, { method: 'phone', identifier: phone, code: CODE })
  assert.strictEqual(created.statusCode, 200)
  assert.strictEqual(created.json().is_new, true)
  assert.ok(typeof created.json().token === 'string')
  const userId = created.json().user.id

  // A fresh code for the same phone → logs into the SAME account.
  await seedOtp(app, { channel: 'phone', identifier: phone, user_id: null })
  const loggedIn = await verify(app, { method: 'phone', identifier: phone, code: CODE })
  assert.strictEqual(loggedIn.json().is_new, false)
  assert.strictEqual(loggedIn.json().user.id, userId)
})

test('verify: wrong code → 401, missing code → 400, unknown method → 400', { skip }, async () => {
  const app = getApp()
  const phone = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: phone, user_id: null })
  assert.strictEqual((await verify(app, { method: 'phone', identifier: phone, code: '000000' })).statusCode, 401)
  // Missing required field → 400 (shared requireNonEmptyString, matches requireBody).
  assert.strictEqual((await verify(app, { method: 'phone', identifier: phone })).statusCode, 400)
  assert.strictEqual((await verify(app, { method: 'nope', identifier: phone, code: CODE })).statusCode, 400)
})

test('verify: an OAuth method with no configured client IDs → 400 UNSUPPORTED_AUTH_METHOD', { skip }, async () => {
  const app = getApp()
  // The test app sets no GOOGLE/APPLE_OAUTH_CLIENT_IDS → those strategies are
  // absent from the registry, so the method is reported unsupported (not 500).
  const res = await verify(app, { method: 'google', id_token: 'whatever' })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'UNSUPPORTED_AUTH_METHOD')
})

// ---------- verify: wallet find-or-reject -----------------------------------

test('verify wallet: unlinked → 404 WALLET_NOT_LINKED; linked → logs in', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  // No account owns this wallet yet → wallet signs in but never creates.
  const rejected = await walletVerify(app, address)
  assert.strictEqual(rejected.statusCode, 404)
  assert.strictEqual(rejected.json().code, 'WALLET_NOT_LINKED')

  // Link the wallet to a user directly (the find-or-create route is gone),
  // then /auth/verify logs into that account.
  const u = await createUser(app, {})
  await app.db.insert(user_wallets).values(walletFixture({ user_id: u.row.id, address }))
  const loggedIn = await walletVerify(app, address)
  assert.strictEqual(loggedIn.statusCode, 200)
  assert.strictEqual(loggedIn.json().user.id, u.row.id)
})

test('verify wallet: a bad signature → 401, does not log in', { skip }, async () => {
  const app = getApp()
  const res = await walletVerify(app, freshAddress(), { signature: FAKE_BAD_SIGNATURE })
  assert.strictEqual(res.statusCode, 401)
})

// ---------- verify: link (bearer) + block-on-collision -----------------------

test('verify link: bearer attaches a new email; a foreign email is blocked', { skip }, async () => {
  const app = getApp()
  // User A via phone.
  const phoneA = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: phoneA, user_id: null })
  const a = (await verify(app, { method: 'phone', identifier: phoneA, code: CODE })).json()

  // A links an email (OTP bound to A by the authenticated challenge).
  const email = uniqEmail()
  await seedOtp(app, { channel: 'email', identifier: email, user_id: a.user.id })
  const linked = await verify(app, { method: 'email', identifier: email, code: CODE }, a.token)
  assert.strictEqual(linked.statusCode, 200)
  assert.strictEqual(linked.json().user.id, a.user.id)
  const ids = await app.db.select().from(user_identities)
  assert.strictEqual(ids.filter((i) => i.user_id === a.user.id && i.kind === 'email').length, 1)

  // User B tries to link the SAME email → blocked, no merge.
  const phoneB = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: phoneB, user_id: null })
  const b = (await verify(app, { method: 'phone', identifier: phoneB, code: CODE })).json()
  await seedOtp(app, { channel: 'email', identifier: email, user_id: b.user.id })
  const blocked = await verify(app, { method: 'email', identifier: email, code: CODE }, b.token)
  assert.strictEqual(blocked.statusCode, 409)
  assert.strictEqual(blocked.json().code, 'IDENTITY_ALREADY_LINKED')
})

test('verify link: re-linking the same identity to the same user is idempotent', { skip }, async () => {
  const app = getApp()
  const phone = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: phone, user_id: null })
  const a = (await verify(app, { method: 'phone', identifier: phone, code: CODE })).json()

  const email = uniqEmail()
  await seedOtp(app, { channel: 'email', identifier: email, user_id: a.user.id })
  assert.strictEqual((await verify(app, { method: 'email', identifier: email, code: CODE }, a.token)).statusCode, 200)
  // Verify the SAME email again (re-verification) → still 200, no duplicate row.
  await seedOtp(app, { channel: 'email', identifier: email, user_id: a.user.id })
  assert.strictEqual((await verify(app, { method: 'email', identifier: email, code: CODE }, a.token)).statusCode, 200)
  const emailRows = await app.db.select().from(user_identities)
  assert.strictEqual(
    emailRows.filter((i) => i.user_id === a.user.id && i.kind === 'email').length,
    1,
    'idempotent re-link must not duplicate the identity row',
  )
})

// ---------- verify: suspended gate ------------------------------------------

test('verify bootstrap: is_seeker lands at CREATE only — a later login can never flip it', { skip }, async () => {
  // is_seeker selects seeker_fee_bps on every escrow the user creates. It is a
  // device-derived signup fact the orchestrator reads ONLY on INSERT; PATCH
  // /v1/users/me no longer accepts it (see seeker-fee-flag.test.ts), so this
  // bootstrap is the flag's one write path and must stay creation-scoped.
  const app = getApp()
  const seekerIsFor = async (id: string): Promise<boolean> => {
    const [r] = await app.db.select({ is_seeker: users.is_seeker }).from(users).where(eq(users.id, id))
    return r.is_seeker
  }

  const phone = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: phone, user_id: null })
  const created = await verify(app, { method: 'phone', identifier: phone, code: CODE, is_seeker: true })
  assert.strictEqual(created.json().is_new, true)
  assert.strictEqual(await seekerIsFor(created.json().user.id), true)

  // An existing NON-seeker account re-logging-in WITH the flag stays false:
  // outside creation the bootstrap is dead weight, not an upgrade path.
  const plain = uniqPhone()
  await seedOtp(app, { channel: 'phone', identifier: plain, user_id: null })
  const plainId = (await verify(app, { method: 'phone', identifier: plain, code: CODE })).json().user.id
  await seedOtp(app, { channel: 'phone', identifier: plain, user_id: null })
  const relog = await verify(app, { method: 'phone', identifier: plain, code: CODE, is_seeker: true })
  assert.strictEqual(relog.statusCode, 200)
  assert.strictEqual(relog.json().is_new, false)
  assert.strictEqual(await seekerIsFor(plainId), false, 'login must not rewrite the fee tier')
})

test('verify: a suspended account cannot log in (403)', { skip }, async () => {
  const app = getApp()
  // Pre-make a suspended user and bind a phone identity to it.
  const { row } = await createUser(getApp(), { status: 'suspended' })
  const phone = uniqPhone()
  await app.db.insert(user_identities).values({
    user_id: row.id,
    kind: 'phone',
    identifier: phone,
    email: null,
    verified_at: new Date(),
  })
  await seedOtp(app, { channel: 'phone', identifier: phone, user_id: null })
  const res = await verify(app, { method: 'phone', identifier: phone, code: CODE })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'USER_SUSPENDED')
})
