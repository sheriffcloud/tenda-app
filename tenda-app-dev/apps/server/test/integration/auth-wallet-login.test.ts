/**
 * Wallet sign-in via POST /v1/auth/verify { method: 'wallet' } chained with
 * POST /v1/auth/nonce. Exercises the full flow end-to-end against the real
 * app + DB: nonce issue → message build → sig verify → nonce consume →
 * find-or-REJECT (decision #3: wallet signs in but never creates) → JWT.
 *
 * This is the deep wallet-lifecycle suite (#98 gap-fill): it owns the
 * adversarial cases the unified-surface smoke (auth-unified) does not — bad
 * sig must NOT burn the nonce, replay, never-issued nonce, issued_at window,
 * chain/address mismatch, unregistered chain → 400 not 500, and the suspended
 * gate. The legacy find-or-CREATE /v1/auth/wallet route was removed at 9C(4b);
 * a wallet that no account owns now returns 404 WALLET_NOT_LINKED.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { users, user_wallets } from '@tenda/shared/db/schema/identity'
import { walletFixture } from '../helpers/fixtures'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  FAKE_BAD_SIGNATURE,
  useTestApp,
  createUser,
} from '../helpers/test-app'
import { AUTH_URI, issueNonce, buildAuthMessage as buildMessage } from '../helpers/auth-message'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const GOOD_SIG = 'sig:ok'

let addrSeq = 0
function freshAddress(): string {
  return `SolLoginWallet${(addrSeq += 1)}1111111111111111111111`
}

type App = ReturnType<typeof getApp>

/** Create a user and link a Solana wallet to it — the precondition for a
 *  successful wallet login now that the route is find-or-reject. */
async function linkedWallet(
  app: App,
  over: { status?: 'active' | 'suspended' } = {},
): Promise<{ address: string; userId: string }> {
  const u = await createUser(app, over.status ? { status: over.status } : {})
  const address = freshAddress()
  await app.db.insert(user_wallets).values(walletFixture({ user_id: u.row.id, address }))
  return { address, userId: u.row.id }
}

function login(
  app: App,
  body: { chain_id?: string; address: string; message: string; signature?: string } & Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/verify',
    payload: { method: 'wallet', chain_id: TEST_CHAIN_ID, signature: GOOD_SIG, ...body },
  })
}

/** Full happy-path: issue → sign → login. */
async function loginFresh(app: App, address: string, over: Record<string, unknown> = {}) {
  const { nonce, issued_at } = await issueNonce(app)
  const message = buildMessage({ address, nonce, issued_at })
  return login(app, { address, message, ...over })
}

// ---------- find-or-reject (decision #3) ---------------------------------------

test('wallet login: an unlinked wallet → 404 WALLET_NOT_LINKED and creates NO user', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const before = (await app.db.select().from(users)).length

  const res = await loginFresh(app, address)
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json().code, 'WALLET_NOT_LINKED')

  // Wallet never creates: no user row, no wallet row materialised.
  assert.strictEqual((await app.db.select().from(users)).length, before)
  assert.strictEqual(
    (await app.db.select().from(user_wallets).where(eq(user_wallets.address, address))).length,
    0,
  )
})

test('wallet login: a linked wallet logs in and returns a JWT carrying id + role', { skip }, async () => {
  const app = getApp()
  const { address, userId } = await linkedWallet(app)

  const before = (await app.db.select().from(users)).length
  const res = await loginFresh(app, address)
  assert.strictEqual(res.statusCode, 200)

  const out = res.json()
  assert.strictEqual(out.user.id, userId)
  assert.strictEqual(out.user.status, 'active')
  assert.strictEqual(out.is_new, false) // wallet never creates
  assert.ok(typeof out.token === 'string' && out.token.length > 0)

  const decoded = app.jwt.verify<{ id: string; role: string }>(out.token)
  assert.strictEqual(decoded.id, userId)
  // No duplicate user from a login.
  assert.strictEqual((await app.db.select().from(users)).length, before)
})

// ---------- input validation ---------------------------------------------------

test('wallet login: missing signature → 400 VALIDATION_ERROR', { skip }, async () => {
  const app = getApp()
  const { nonce, issued_at } = await issueNonce(app)
  const address = freshAddress()
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/verify',
    payload: { method: 'wallet', chain_id: TEST_CHAIN_ID, address, message: buildMessage({ address, nonce, issued_at }) },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('wallet login: malformed message (no Nonce line) → 400', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const message = `Tenda wants you to sign in with your wallet:\n${address}\n\nChain: ${TEST_CHAIN_ID}\nURI: ${AUTH_URI}\nIssued At: ${new Date().toISOString()}`
  const res = await login(app, { address, message })
  assert.strictEqual(res.statusCode, 400)
})

test('wallet login: chain / address mismatch between body and message → 400', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const { nonce, issued_at } = await issueNonce(app)

  // message Chain differs from body chain_id
  const chainMismatch = await login(app, {
    address,
    message: buildMessage({ address, chain_id: 'solana:mainnet', nonce, issued_at }),
  })
  assert.strictEqual(chainMismatch.statusCode, 400)

  // message address differs from body address
  const addrMismatch = await login(app, {
    address,
    message: buildMessage({ address: freshAddress(), nonce, issued_at }),
  })
  assert.strictEqual(addrMismatch.statusCode, 400)
})

test('wallet login: issued_at outside the ±60s window → 400', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const { nonce } = await issueNonce(app)
  const stale = new Date(Date.now() - 120_000).toISOString()
  const res = await login(app, { address, message: buildMessage({ address, nonce, issued_at: stale }) })
  assert.strictEqual(res.statusCode, 400)
})

test('wallet login: a valid namespace on an UNPROVISIONED chain is accepted (login ≠ escrow provisioning)', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const { nonce, issued_at } = await issueNonce(app)
  // eip155:8453 is a valid CAIP-2 but NOT registered in the harness registry.
  // Login verifies the signature by NAMESPACE (pure crypto, no escrow/RPC), so
  // the chain gate passes and an unknown wallet surfaces as 404 — NOT a 400
  // "unsupported chain" rejection (the old coupling, now removed).
  const res = await login(app, {
    chain_id: 'eip155:8453',
    address,
    message: buildMessage({ address, chain_id: 'eip155:8453', nonce, issued_at }),
  })
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json().code, 'WALLET_NOT_LINKED')
})

test('wallet login: an unsupported chain NAMESPACE → 400 VALIDATION_ERROR', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const { nonce, issued_at } = await issueNonce(app)
  const res = await login(app, {
    chain_id: 'cosmos:1',
    address,
    message: buildMessage({ address, chain_id: 'cosmos:1', nonce, issued_at }),
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

// ---------- signature + nonce lifecycle (adversarial) --------------------------

test('wallet login: a bad signature → 401 and does NOT consume the nonce', { skip }, async () => {
  const app = getApp()
  // Linked so the post-recovery good login reaches a 200 (find-or-reject).
  const { address } = await linkedWallet(app)
  const { nonce, issued_at } = await issueNonce(app)
  const message = buildMessage({ address, nonce, issued_at })

  const bad = await login(app, { address, message, signature: FAKE_BAD_SIGNATURE })
  assert.strictEqual(bad.statusCode, 401)
  assert.strictEqual(bad.json().code, 'INVALID_SIGNATURE')

  // The same nonce must still work — sig-check runs BEFORE consume, so an
  // attacker can't burn an observed nonce with garbage signatures.
  const good = await login(app, { address, message, signature: GOOD_SIG })
  assert.strictEqual(good.statusCode, 200)
})

test('wallet login: replaying a consumed nonce → 409 AUTH_NONCE_REPLAY', { skip }, async () => {
  const app = getApp()
  const { address } = await linkedWallet(app)
  const { nonce, issued_at } = await issueNonce(app)
  const message = buildMessage({ address, nonce, issued_at })

  assert.strictEqual((await login(app, { address, message })).statusCode, 200)
  const replay = await login(app, { address, message })
  assert.strictEqual(replay.statusCode, 409)
  assert.strictEqual(replay.json().code, 'AUTH_NONCE_REPLAY')
})

test('wallet login: a never-issued nonce → 401 AUTH_NONCE_UNKNOWN', { skip }, async () => {
  const app = getApp()
  const address = freshAddress()
  const nonce = randomBytes(32).toString('base64url') // well-formed (43 chars), never inserted
  const message = buildMessage({ address, nonce, issued_at: new Date().toISOString() })
  const res = await login(app, { address, message })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(res.json().code, 'AUTH_NONCE_UNKNOWN')
})

// ---------- account state ------------------------------------------------------

test('wallet login: a suspended user → 403 USER_SUSPENDED', { skip }, async () => {
  const app = getApp()
  const { address } = await linkedWallet(app, { status: 'suspended' })

  const res = await loginFresh(app, address)
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'USER_SUSPENDED')
})
