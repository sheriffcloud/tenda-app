/**
 * The demo session (#108): the door a reviewer with no wallet walks through.
 *
 * Round one measured the failure precisely — `POST /v1/agent/tasks` answers 401
 * to a stranger, so all ten reviewers stopped at the document and none saw the
 * x402 loop it describes. The case that matters here is therefore not "the
 * route returns a token"; it is that the token REACHES THE 402. Everything else
 * in this file guards what the demo must not become.
 *
 * `../helpers/agent-demo-env` is imported FIRST and for its side effect: config
 * memoises on first read, so the address has to be set before the harness
 * builds an app. The 503-when-unconfigured half is a separate suite for exactly
 * that reason — one process cannot hold both answers.
 */
import { DEMO_ADDRESS } from '../helpers/agent-demo-env'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { ErrorCode, apiRoutes, type AgentRegisterResponse, type AgentTaskPaymentRequired } from '@tenda/shared'
import { user_wallets, users } from '@tenda/shared/db/schema'
import { DEMO_AGENT_NAME } from '@server/features/agent/demo/demoSession'
import {
  TEST_DB_CONFIGURED,
  authHeader,
  createUser,
  resetDb,
  seedAltChain,
  useTestApp,
} from '../helpers/test-app'
import { agentTaskBody } from '../helpers/agent'
import { COMPONENT_REF_PREFIX, agentApiAjv } from '@tenda/api-doc/testing'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** POST the demo-session route with no body at all, exactly as documented. */
async function openDemoSession(): Promise<AgentRegisterResponse> {
  const response = await getApp().inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(response.statusCode, 200, response.body)
  return response.json<AgentRegisterResponse>()
}

test('it mints a bearer for an AGENT account, with no proof and no body', { skip }, async () => {
  const session = await openDemoSession()
  assert.ok(session.token.length > 0)
  assert.strictEqual(session.user.is_agent, true, 'a demo account must carry the badge like any other agent')
  assert.strictEqual(session.user.first_name, DEMO_AGENT_NAME, 'it says what it is rather than posing as a customer')
  assert.strictEqual(session.is_new, true, 'the first caller on an empty database creates it')
})

test('the live 200 validates against the CLOSED schema the document publishes for it', { skip }, async () => {
  // The route is typed `Reply: AgentRegisterResponse`, so the compiler already
  // holds the SHAPE. What it cannot hold is the DOCUMENT: `AgentRegisterResponse`
  // is documented for registration, and this endpoint reuses that schema by
  // reference — so the promise a reader reads is only true if the live body
  // satisfies it. Registration's own drift case proves it for registration; this
  // proves it for the door the demo opens, which is the one a reviewer uses.
  const session = await openDemoSession()
  const ajv = agentApiAjv()
  const validate = ajv.getSchema(`${COMPONENT_REF_PREFIX}AgentRegisterResponse`)
  assert.ok(validate !== undefined, 'the document registers no AgentRegisterResponse')
  assert.strictEqual(
    validate(session),
    true,
    `the demo 200 drifted from the document:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`,
  )
})

test('a body-less POST works however the caller spells it — including with a JSON content-type', { skip }, async () => {
  // The document says "no body". Most HTTP clients, and every agent framework
  // that wraps one, set `content-type: application/json` regardless — and
  // Fastify's JSON parser rejects an EMPTY body under that header with a 400
  // before the handler is ever reached. MEASURED before this was fixed: 200
  // with no content-type, 400 with it. That is the round-one failure again, at
  // the one door built to end it, and a reader following the document exactly
  // is the one it hits.
  for (const headers of [{}, { 'content-type': 'application/json' }]) {
    const response = await getApp().inject({ method: 'POST', url: apiRoutes.agent.demoSession, headers })
    assert.strictEqual(response.statusCode, 200, `content-type ${JSON.stringify(headers)}: ${response.body}`)
  }
  // …and a body that is present but malformed is still a 400: the parser was
  // widened for the EMPTY case only, not switched off.
  const garbled = await getApp().inject({
    method: 'POST',
    url: apiRoutes.agent.demoSession,
    headers: { 'content-type': 'application/json' },
    payload: '{ not json',
  })
  assert.strictEqual(garbled.statusCode, 400)
  // And the widening is SCOPED to this route. Autoload registers each route
  // file unwrapped, so the parser lives in this plugin only — the sibling
  // registration endpoint must still refuse an empty JSON body, or the fix
  // quietly changed how the whole server parses requests.
  const sibling = await getApp().inject({
    method: 'POST',
    url: apiRoutes.agent.register,
    headers: { 'content-type': 'application/json' },
  })
  assert.strictEqual(sibling.statusCode, 400, 'the empty-body allowance leaked outside this route')
})

test('the account is SHARED — a second call signs the same agent in, it does not mint a new one', { skip }, async () => {
  // An account per call would let anyone fill the users table by looping, and
  // would scatter demo drafts across identities nobody can find later.
  const first = await openDemoSession()
  const second = await openDemoSession()
  assert.strictEqual(second.user.id, first.user.id)
  assert.strictEqual(second.is_new, false)
  // A returning caller must get a bearer that WORKS. Asserting it is merely a
  // non-empty string proved nothing — `jwt.sign` cannot return one — so this
  // spends the token instead. The body is empty on purpose: anything but 401
  // means the token authenticated, and what it then fails validation for is
  // this case's business.
  const spent = await getApp().inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(second.token),
    payload: {},
  })
  assert.notStrictEqual(spent.statusCode, 401, 'the returning caller\'s bearer does not authenticate')
})

test('the configured address is stored NORMALISED, not as the operator typed it', { skip }, async () => {
  // AGENT_DEMO_ADDRESS is whatever an operator pasted, and block explorers hand
  // out the EIP-55 checksummed form. `user_wallets` dedups on the exact
  // (chain_ns, address) pair while every READ folds case, so a create that
  // skipped normalisation would not fail — it would sit there until the same
  // wallet arrived through the proof path and became a SECOND row for one
  // wallet. Only the stored value can catch it.
  const app = getApp()
  await resetDb(app)
  const session = await openDemoSession()
  const [wallet] = await app.db
    .select({ address: user_wallets.address, is_primary: user_wallets.is_primary })
    .from(user_wallets)
    .where(eq(user_wallets.user_id, session.user.id))
  assert.ok(wallet !== undefined, 'the demo agent has no linked wallet — it could never be quoted terms')
  assert.notStrictEqual(DEMO_ADDRESS, DEMO_ADDRESS.toLowerCase(), 'the fixture must be mixed case or this proves nothing')
  assert.strictEqual(wallet.address, DEMO_ADDRESS.toLowerCase())
  assert.strictEqual(wallet.is_primary, true, 'terms resolve through the PRIMARY wallet')
})

test('the demo bearer REACHES THE 402 — the step every round-one reviewer missed', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const session = await openDemoSession()

  // The same body the document publishes as its request example.
  const quoted = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(session.token),
    payload: agentTaskBody(),
  })
  assert.strictEqual(quoted.statusCode, 402, quoted.body)
  const terms = quoted.json<AgentTaskPaymentRequired>()
  const offer = terms.accepts[0]
  assert.ok(offer !== undefined, 'the 402 carried no terms')
  assert.ok(offer.payment.kind === 'eip155-authorization')
  // Terms are built FOR the configured demo address — which is the whole reason
  // an address is enough and a key is not: this is signable only by its holder.
  assert.strictEqual(offer.payment.creator.toLowerCase(), DEMO_ADDRESS.toLowerCase())
  assert.strictEqual(offer.payment.typed_data.message.from.toLowerCase(), DEMO_ADDRESS.toLowerCase())
})

test('nothing the demo posts reaches the public feed', { skip }, async () => {
  // Not a rule added for the demo — the rule already there. A task is a DRAFT
  // until a confirmed on-chain create moves it to `open`, and the feed shows
  // only open gigs. The demo cannot fund, so it can never publish.
  const app = getApp()
  await seedAltChain(app)
  const session = await openDemoSession()
  const quoted = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(session.token),
    payload: agentTaskBody(),
  })
  assert.strictEqual(quoted.statusCode, 402, quoted.body)

  const feed = await app.inject({ method: 'GET', url: apiRoutes.gigs.list })
  assert.strictEqual(feed.statusCode, 200)
  assert.strictEqual(feed.json<{ total: number }>().total, 0, 'a demo draft surfaced publicly')

  // And the draft IS there for its owner — so the assertion above is about
  // visibility, not about the task having failed to exist.
  const own = await app.inject({
    method: 'GET',
    url: apiRoutes.gigs.get.replace(':id', quoted.json<AgentTaskPaymentRequired>().task_id),
    headers: authHeader(session.token),
  })
  assert.strictEqual(own.statusCode, 200, own.body)
})

test('the session is anonymous to obtain but ordinary once held', { skip }, async () => {
  // No bearer is needed to open one…
  const opened = await getApp().inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(opened.statusCode, 200)
  // …and the token behaves like any other: a garbled one is still refused, so
  // the demo widens WHO can get a session, never what an unauthenticated call
  // may do.
  const refused = await getApp().inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: { authorization: 'Bearer not-a-token' },
    payload: agentTaskBody(),
  })
  assert.strictEqual(refused.statusCode, 401)
})

test('a demo address that a PERSON already holds is a deployment fault, not a caller fault', { skip }, async () => {
  // Reachable in production: an operator naturally reaches for an address they
  // control, and that address may already be linked to their own human account.
  // The shared find-or-create refuses a human's wallet with 409
  // IDENTITY_ALREADY_LINKED and tells the caller to "sign in through
  // /v1/auth/verify" — correct advice for the registration path, and useless
  // here, where the caller did nothing and cannot act on it. Worse, it is a
  // status the document does not declare, so a reviewer meets an unexplained
  // conflict at the one door built for them and concludes the API is broken:
  // exactly the round-one outcome this task exists to end.
  const app = getApp()
  await resetDb(app)
  const human = await createUser(app)
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155',
    address: DEMO_ADDRESS.toLowerCase(),
    user_id: human.row.id,
    is_primary: true,
  })
  const response = await app.inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(response.statusCode, 503, response.body)
  const body = response.json<{ code: string; message: string }>()
  assert.strictEqual(body.code, ErrorCode.SERVICE_UNAVAILABLE)
  assert.match(body.message, /AGENT_DEMO_ADDRESS/, 'the operator must be told which variable is wrong')
  assert.doesNotMatch(body.message, /auth\/verify/, 'and NOT be handed the registration path\'s advice')
})

test('a demo session is refused when the account is suspended', { skip }, async () => {
  // The demo account is an ordinary row: an operator who suspends it must be
  // able to close the door without a deploy.
  const app = getApp()
  await resetDb(app)
  const session = await openDemoSession()
  await app.db.update(users).set({ status: 'suspended' }).where(eq(users.id, session.user.id))
  const after = await app.inject({ method: 'POST', url: apiRoutes.agent.demoSession })
  assert.strictEqual(after.statusCode, 403, after.body)
})
