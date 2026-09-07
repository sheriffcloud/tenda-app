/**
 * POST /v1/escrows/:id/fund — the x402 contract of the relayed-funding route
 * against the real app: the 402 envelope, the header handling, the attempt
 * recording and settlement header on 202, the 503 where a chain has no
 * relayer, and the draft guards it shares with build-create.
 *
 * The harness's eip155 fake adapter carries a fake relay (constant terms,
 * constant reference); what the ARTIFACT must satisfy is the adapters' own
 * unit suites and the anvil/litesvm suites. Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { tx_attempts, user_wallets } from '@tenda/shared/db/schema'
import { TENDA_RELAY_SCHEME, X402_VERSION, X_PAYMENT_HEADER, X_PAYMENT_RESPONSE_HEADER, apiRoutes } from '@tenda/shared'
import {
  FAKE_RELAYED_TX_REF,
  TEST_ASSET_ALT,
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  authHeader,
  capturedRelays,
  createEscrow,
  createTransactableUser,
  createUser,
  seedAltChain,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const url = (id: string): string => apiRoutes.escrows.fund.replace(':id', id)
const AGENT_WALLET = `0x${'a6'.repeat(20)}`
const SECOND_WALLET = `0x${'b7'.repeat(20)}`
const PAYMENT = Buffer.from(
  JSON.stringify({
    x402Version: X402_VERSION,
    scheme: TENDA_RELAY_SCHEME,
    network: TEST_CHAIN_ID_ALT,
    payload: {
      signature: `0x${'44'.repeat(65)}`,
      authorization: { from: AGENT_WALLET, to: `0x${'f1'.repeat(20)}`, value: '25000000', validAfter: '0', validBefore: '1900000000', nonce: `0x${'33'.repeat(32)}` },
    },
  }),
).toString('base64')

/** A transactable user who ALSO holds an eip155 wallet — the agent. */
async function createAgent(app: ReturnType<typeof getApp>) {
  const agent = await createTransactableUser(app)
  // One primary per USER (not per namespace): the Solana wallet
  // makeTransactable linked holds it, and the eip155 resolver falls back to
  // the only linked wallet of its namespace — which is the production shape.
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155',
    address: AGENT_WALLET,
    user_id: agent.row.id,
    is_primary: false,
    verified_at: new Date(),
  })
  return agent
}

async function agentDraft(app: ReturnType<typeof getApp>, creator_id: string) {
  await seedAltChain(app)
  return createEscrow(app, { creator_id, chain_id: TEST_CHAIN_ID_ALT, asset: TEST_ASSET_ALT, amount_raw: '25000000' })
}

test('fund: without X-PAYMENT the answer is the 402 x402 envelope with the draft\'s terms', { skip }, async () => {
  const app = getApp()
  const agent = await createAgent(app)
  const draft = await agentDraft(app, agent.row.id)
  const res = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(agent.token) })
  assert.strictEqual(res.statusCode, 402, res.body)
  const body = res.json()
  assert.strictEqual(body.x402Version, X402_VERSION)
  assert.match(body.error, /payment required/)
  assert.strictEqual(body.accepts.length, 1)
  const terms = body.accepts[0]
  assert.strictEqual(terms.scheme, TENDA_RELAY_SCHEME)
  assert.strictEqual(terms.network, TEST_CHAIN_ID_ALT)
  assert.strictEqual(terms.escrow_id, draft.id)
  assert.strictEqual(terms.amount_raw, '25000000')
  assert.strictEqual(terms.payment.kind, 'eip155-authorization')
  assert.strictEqual(terms.payment.creator, AGENT_WALLET)
  // The route handed the adapter the draft as the payload, for this creator.
  assert.strictEqual(capturedRelays.length, 1)
  assert.strictEqual(capturedRelays[0]?.op, 'quote')
  assert.strictEqual(capturedRelays[0]?.args.payload.escrow_id, draft.id)
  assert.strictEqual(capturedRelays[0]?.args.creator_address, AGENT_WALLET)
  assert.strictEqual(capturedRelays[0]?.args.user_id, agent.row.id)
  // No attempt is recorded by a quote.
  const attempts = await app.db.select().from(tx_attempts).where(eq(tx_attempts.escrow_id, draft.id))
  assert.strictEqual(attempts.length, 0)
})

test('fund: with X-PAYMENT the artifact is relayed, the attempt recorded, and the settlement header set', { skip }, async () => {
  const app = getApp()
  const agent = await createAgent(app)
  const draft = await agentDraft(app, agent.row.id)
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: PAYMENT },
  })
  assert.strictEqual(res.statusCode, 202, res.body)
  assert.deepStrictEqual(res.json(), { status: 'queued', tx_ref: FAKE_RELAYED_TX_REF, recorded: true, enqueued: false })
  const settlement = JSON.parse(Buffer.from(String(res.headers[X_PAYMENT_RESPONSE_HEADER]), 'base64').toString('utf8'))
  assert.deepStrictEqual(settlement, { success: true, transaction: FAKE_RELAYED_TX_REF, network: TEST_CHAIN_ID_ALT, payer: AGENT_WALLET })
  // Relayed with the decoded envelope, as the creator.
  const relayed = capturedRelays.find((c) => c.op === 'relay')
  assert.ok(relayed)
  assert.strictEqual(relayed.args.creator_address, AGENT_WALLET)
  // Recorded exactly like a client-ping of a create, attributed to the agent.
  const [attempt] = await app.db.select().from(tx_attempts).where(eq(tx_attempts.tx_ref, FAKE_RELAYED_TX_REF))
  assert.ok(attempt)
  assert.strictEqual(attempt.user_id, agent.row.id)
  assert.strictEqual(attempt.escrow_id, draft.id)
  assert.strictEqual(attempt.action, 'create')
  // A second relay of the same draft is refused while the first is unsettled
  // — the pending-create guard, so the relayer can never fund a draft twice.
  const again = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: PAYMENT },
  })
  assert.strictEqual(again.statusCode, 409)
  assert.strictEqual(again.json().code, 'ESCROW_WRONG_STATUS')
})

test('fund: a malformed X-PAYMENT is a 400 before any relay work', { skip }, async () => {
  const app = getApp()
  const agent = await createAgent(app)
  const draft = await agentDraft(app, agent.row.id)
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: 'not-base64-json' },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
  assert.match(res.json().message, /X-PAYMENT header/)
  assert.strictEqual(capturedRelays.length, 0)
})

test('fund: a chain without a relayer answers 503 RELAY_UNAVAILABLE (the Solana fake)', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app)
  const draft = await createEscrow(app, { creator_id: creator.row.id })
  const res = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(creator.token) })
  assert.strictEqual(res.statusCode, 503)
  assert.strictEqual(res.json().code, 'RELAY_UNAVAILABLE')
})

test('fund: the signer preference picks the creator wallet; an unlinked one is refused', { skip }, async () => {
  const app = getApp()
  const agent = await createAgent(app)
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155', address: SECOND_WALLET, user_id: agent.row.id, is_primary: false, verified_at: new Date(),
  })
  const draft = await agentDraft(app, agent.row.id)
  const chosen = await app.inject({
    method: 'POST', url: url(draft.id), headers: authHeader(agent.token), payload: { signer_address: SECOND_WALLET },
  })
  assert.strictEqual(chosen.statusCode, 402)
  assert.strictEqual(chosen.json().accepts[0].payment.creator, SECOND_WALLET)
  const unlinked = await app.inject({
    method: 'POST', url: url(draft.id), headers: authHeader(agent.token), payload: { signer_address: `0x${'c8'.repeat(20)}` },
  })
  assert.strictEqual(unlinked.statusCode, 422)
  assert.strictEqual(unlinked.json().code, 'ESCROW_WRONG_WALLET')
})

test('fund: shares build-create\'s draft guards — 404 unknown, 403 stranger, 409 published, 403 profile-incomplete', { skip }, async () => {
  const app = getApp()
  const agent = await createAgent(app)
  const stranger = await createUser(app)
  const draft = await agentDraft(app, agent.row.id)

  const missing = await app.inject({ method: 'POST', url: url('f0e36d8a-0000-0000-0000-000000000000'), headers: authHeader(agent.token) })
  assert.strictEqual(missing.statusCode, 404)
  const foreign = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(stranger.token) })
  assert.strictEqual(foreign.statusCode, 403)
  const open = await createEscrow(app, { creator_id: agent.row.id, chain_id: TEST_CHAIN_ID_ALT, asset: TEST_ASSET_ALT, status: 'open' })
  const published = await app.inject({ method: 'POST', url: url(open.id), headers: authHeader(agent.token) })
  assert.strictEqual(published.statusCode, 409)
  const incomplete = await createUser(app, { first_name: '' })
  const gated = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(incomplete.token) })
  assert.strictEqual(gated.statusCode, 403)
  assert.strictEqual(gated.json().code, 'PROFILE_INCOMPLETE')
  assert.strictEqual(capturedRelays.length, 0)
})
