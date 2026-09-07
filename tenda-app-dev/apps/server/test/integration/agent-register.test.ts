/**
 * POST /v1/agent/register — wallet-born agent accounts (#19) against the real
 * app: a proven wallet creates an is_agent account with the wallet linked as
 * primary and answers a usable bearer; the same wallet again signs that agent
 * back in; a human's wallet is refused; and the human wallet login still
 * never creates (decision #3 is untouched).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { and, eq } from 'drizzle-orm'
import { user_wallets, users } from '@tenda/shared/db/schema'
import { NAME_MAX_LENGTH, apiRoutes, type AgentRegisterBody } from '@tenda/shared'
import { FAKE_BAD_SIGNATURE, TEST_CHAIN_ID_ALT, TEST_DB_CONFIGURED, authHeader, createUser, useTestApp } from '../helpers/test-app'
import { buildAuthMessage, issueNonce } from '../helpers/auth-message'
import { agentWalletAddress, registerAgent } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('register: a proven, unlinked wallet creates an is_agent account, links it as primary, and the token works', { skip }, async () => {
  const app = getApp()
  const { response, token, address } = await registerAgent(app, { name: '  Courier Bot ', country: 'NG' })
  assert.strictEqual(response.is_new, true)
  assert.strictEqual(response.user.is_agent, true)
  assert.strictEqual(response.user.first_name, 'Courier Bot', 'the name is trimmed')
  assert.strictEqual(response.user.last_name, '')
  assert.strictEqual(response.user.country, 'NG')
  const [wallet] = await app.db
    .select()
    .from(user_wallets)
    .where(and(eq(user_wallets.user_id, response.user.id), eq(user_wallets.chain_ns, 'eip155')))
  assert.ok(wallet)
  assert.strictEqual(wallet.address, address.toLowerCase(), 'stored canonical (lowercased)')
  assert.strictEqual(wallet.is_primary, true)
  // The bearer is an ordinary session.
  const me = await app.inject({ method: 'GET', url: apiRoutes.auth.me, headers: authHeader(token) })
  assert.strictEqual(me.statusCode, 200, me.body)
  assert.strictEqual(me.json().id, response.user.id)
})

test('register: the same wallet again signs the agent back in — no second account, name changes ignored', { skip }, async () => {
  const app = getApp()
  const first = await registerAgent(app, { name: 'One' })
  const again = await registerAgent(app, { address: first.address, name: 'Two' })
  assert.strictEqual(again.response.is_new, false)
  assert.strictEqual(again.response.user.id, first.response.user.id)
  assert.strictEqual(again.response.user.first_name, 'One')
  const agents = await app.db.select({ id: users.id }).from(users).where(eq(users.is_agent, true))
  assert.strictEqual(agents.length, 1)
})

test('register: a wallet that belongs to a person is refused 409, and no agent row is left behind', { skip }, async () => {
  const app = getApp()
  const human = await createUser(app)
  const address = agentWalletAddress()
  await app.db.insert(user_wallets).values({ chain_ns: 'eip155', address: address.toLowerCase(), user_id: human.row.id, is_primary: true })
  const { nonce, issued_at } = await issueNonce(app)
  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.register,
    payload: { chain_id: TEST_CHAIN_ID_ALT, address, message: buildAuthMessage({ address, chain_id: TEST_CHAIN_ID_ALT, nonce, issued_at }), signature: 'sig', name: 'Impostor' },
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'IDENTITY_ALREADY_LINKED')
  const agents = await app.db.select({ id: users.id }).from(users).where(eq(users.is_agent, true))
  assert.strictEqual(agents.length, 0)
})

test('register: refusals — bad signature 401, replayed nonce 409, missing/overlong name 400, unknown country 400, and nothing is created', { skip }, async () => {
  const app = getApp()
  const address = agentWalletAddress()
  const post = (payload: Partial<AgentRegisterBody>) => app.inject({ method: 'POST', url: apiRoutes.agent.register, payload })
  const proof = async () => {
    const { nonce, issued_at } = await issueNonce(app)
    return { chain_id: TEST_CHAIN_ID_ALT, address, message: buildAuthMessage({ address, chain_id: TEST_CHAIN_ID_ALT, nonce, issued_at }) }
  }
  const bad = await post({ ...(await proof()), signature: FAKE_BAD_SIGNATURE, name: 'Bot' })
  assert.strictEqual(bad.statusCode, 401)
  assert.strictEqual(bad.json().code, 'INVALID_SIGNATURE')
  const noName = await post({ ...(await proof()), signature: 'sig' })
  assert.strictEqual(noName.statusCode, 400)
  // Trimmed BEFORE the length check: a name of spaces is no name (the same rule the profile guard applies).
  const blankName = await post({ ...(await proof()), signature: 'sig', name: '   ' })
  assert.strictEqual(blankName.statusCode, 400)
  const longName = await post({ ...(await proof()), signature: 'sig', name: 'x'.repeat(NAME_MAX_LENGTH + 1) })
  assert.strictEqual(longName.statusCode, 400)
  const badCountry = await post({ ...(await proof()), signature: 'sig', name: 'Bot', country: 'ZZ' })
  assert.strictEqual(badCountry.statusCode, 400)
  // A key every plain object inherits is not a country. `'toString' in LOCATIONS`
  // is TRUE, so a membership check written that way stored it — and `country`
  // rides UserRef on every gig the agent posts, where the published schema
  // admits the LOCATIONS keys and null and nothing else.
  const protoCountry = await post({ ...(await proof()), signature: 'sig', name: 'Bot', country: 'toString' })
  assert.strictEqual(protoCountry.statusCode, 400, protoCountry.body)
  // A consumed nonce cannot register a second time.
  const p = await proof()
  assert.strictEqual((await post({ ...p, signature: 'sig', name: 'Bot' })).statusCode, 200)
  const replay = await post({ ...p, signature: 'sig', name: 'Bot' })
  assert.strictEqual(replay.statusCode, 409, 'a spent nonce is a conflict (lib/nonce), the same answer every wallet route gives')
  assert.strictEqual(replay.json().code, 'AUTH_NONCE_REPLAY')
  const agents = await app.db.select({ id: users.id }).from(users).where(eq(users.is_agent, true))
  assert.strictEqual(agents.length, 1, 'only the one successful registration')
})

test('register: a suspended agent is refused 403 USER_SUSPENDED on re-registration, with no second account', { skip }, async () => {
  const app = getApp()
  const first = await registerAgent(app)
  await app.db.update(users).set({ status: 'suspended' }).where(eq(users.id, first.response.user.id))
  const { nonce, issued_at } = await issueNonce(app)
  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.register,
    payload: { chain_id: TEST_CHAIN_ID_ALT, address: first.address, message: buildAuthMessage({ address: first.address, chain_id: TEST_CHAIN_ID_ALT, nonce, issued_at }), signature: 'sig', name: 'Back' },
  })
  assert.strictEqual(res.statusCode, 403, res.body)
  assert.strictEqual(res.json().code, 'USER_SUSPENDED')
  const agents = await app.db.select({ id: users.id }).from(users).where(eq(users.is_agent, true))
  assert.strictEqual(agents.length, 1)
})

test('the human wallet login still never creates: an unlinked wallet on /v1/auth/verify is WALLET_NOT_LINKED', { skip }, async () => {
  const app = getApp()
  const address = agentWalletAddress()
  const { nonce, issued_at } = await issueNonce(app)
  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.auth.verify,
    payload: { method: 'wallet', chain_id: TEST_CHAIN_ID_ALT, address, message: buildAuthMessage({ address, chain_id: TEST_CHAIN_ID_ALT, nonce, issued_at }), signature: 'sig' },
  })
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json().code, 'WALLET_NOT_LINKED')
})

test('an agent signs back in through the ordinary wallet login once registered', { skip }, async () => {
  const app = getApp()
  const { address, response } = await registerAgent(app)
  const { nonce, issued_at } = await issueNonce(app)
  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.auth.verify,
    payload: { method: 'wallet', chain_id: TEST_CHAIN_ID_ALT, address, message: buildAuthMessage({ address, chain_id: TEST_CHAIN_ID_ALT, nonce, issued_at }), signature: 'sig' },
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  assert.strictEqual(res.json().user.id, response.user.id)
  assert.strictEqual(res.json().is_new, false)
})
