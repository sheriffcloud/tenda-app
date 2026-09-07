/**
 * POST /v1/agent/tasks — the one-shot (#19) against the real app: one body,
 * 402 with terms bound to the draft it minted (listing attached, moderated),
 * the SAME body resent with X-PAYMENT relayed and recorded; idempotent on
 * creation_operation_id; agent-only; every gate of the human flow intact.
 * The relay itself is the eip155 fake (constant terms/reference) — the
 * artifact checks are the adapters' own suites.
 *
 * The LISTING half — moderation and the fields the listing validator refuses —
 * is agent-tasks-listing.test.ts, split off at the 300-line house limit.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, gig_details, tx_attempts, user_wallets } from '@tenda/shared/db/schema'
import { X402_VERSION, X_PAYMENT_HEADER, X_PAYMENT_RESPONSE_HEADER, apiRoutes, type AgentTaskCreated, type AgentTaskPaymentRequired } from '@tenda/shared'
import { FAKE_RELAYED_TX_REF, TEST_CHAIN_ID, TEST_CHAIN_ID_ALT, TEST_DB_CONFIGURED, authHeader, capturedRelays, createTransactableUser, createUser, seedAltChain, useTestApp } from '../helpers/test-app'
import { agentPaymentHeader, agentTaskBody, agentWalletAddress, registerAgent, type TaskPost } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
const URL = apiRoutes.agent.tasks

test('one-shot: the first call mints the draft + listing and answers 402 with terms bound to it', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const body = agentTaskBody()
  const res = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(res.statusCode, 402, res.body)
  const answer = res.json<AgentTaskPaymentRequired>()
  assert.strictEqual(answer.x402Version, X402_VERSION)
  assert.strictEqual(answer.accepts.length, 1)
  assert.strictEqual(answer.accepts[0]?.escrow_id, answer.task_id)
  assert.strictEqual(answer.accepts[0]?.amount_raw, body.amount_raw)
  assert.strictEqual(answer.accepts[0]?.payment.creator, agent.address.toLowerCase())
  // The draft and its listing exist, owned by the agent, keyed by the operation.
  const [draft] = await app.db.select().from(escrows).where(eq(escrows.id, answer.task_id))
  assert.ok(draft)
  assert.strictEqual(draft.status, 'draft')
  assert.strictEqual(draft.creator_id, agent.response.user.id)
  assert.strictEqual(draft.creation_operation_id, body.creation_operation_id)
  const [listing] = await app.db.select().from(gig_details).where(eq(gig_details.escrow_id, answer.task_id))
  assert.strictEqual(listing?.title, body.title)
  assert.deepStrictEqual(listing?.proof_requirements, ['image'])
  // Only a quote was asked of the adapter; nothing was recorded.
  assert.deepStrictEqual(capturedRelays.map((c) => c.op), ['quote'])
  assert.strictEqual((await app.db.select().from(tx_attempts)).length, 0)
  // The agent can already read its own draft with the bearer — the poll target.
  const read = await app.inject({ method: 'GET', url: apiRoutes.gigs.get.replace(':id', answer.task_id), headers: authHeader(agent.token) })
  assert.strictEqual(read.statusCode, 200)
  assert.strictEqual(read.json().status, 'draft')
  assert.strictEqual(read.json().creator.is_agent, true)
})

test('one-shot: the same body resent with X-PAYMENT lands on the SAME draft, relays, records, answers 201', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const body = agentTaskBody()
  const quote = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(quote.statusCode, 402)
  const task_id = quote.json<AgentTaskPaymentRequired>().task_id
  const res = await app.inject({ method: 'POST', url: URL, headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: agentPaymentHeader(agent.address) }, payload: body })
  assert.strictEqual(res.statusCode, 201, res.body)
  const created = res.json<AgentTaskCreated>()
  assert.deepStrictEqual(created, { task_id, tx_ref: FAKE_RELAYED_TX_REF, status: 'draft', recorded: true, enqueued: false })
  const settlement = JSON.parse(Buffer.from(String(res.headers[X_PAYMENT_RESPONSE_HEADER]), 'base64').toString('utf8'))
  assert.deepStrictEqual(settlement, { success: true, transaction: FAKE_RELAYED_TX_REF, network: TEST_CHAIN_ID_ALT, payer: agent.address.toLowerCase() })
  const drafts = await app.db.select({ id: escrows.id }).from(escrows).where(eq(escrows.creator_id, agent.response.user.id))
  assert.strictEqual(drafts.length, 1, 'one draft across both calls')
  const [attempt] = await app.db.select().from(tx_attempts).where(eq(tx_attempts.escrow_id, task_id))
  assert.strictEqual(attempt?.action, 'create')
  assert.strictEqual(attempt?.user_id, agent.response.user.id)
  // A third resend while the create is unsettled is the pending-create 409.
  const again = await app.inject({ method: 'POST', url: URL, headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: agentPaymentHeader(agent.address) }, payload: body })
  assert.strictEqual(again.statusCode, 409)
  assert.strictEqual(again.json().code, 'ESCROW_WRONG_STATUS')
})

test('one-shot: the operation key refuses changed terms (409) but a changed LISTING re-attaches to the same draft', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const body = agentTaskBody()
  const first = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(first.statusCode, 402)
  const task_id = first.json<AgentTaskPaymentRequired>().task_id
  const changed = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: { ...body, amount_raw: '26000000' } })
  assert.strictEqual(changed.statusCode, 409)
  assert.match(changed.json().message, /different escrow terms/)
  const retitled = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: { ...body, title: 'Photograph the storefront (urgent)' } })
  assert.strictEqual(retitled.statusCode, 402)
  assert.strictEqual(retitled.json<AgentTaskPaymentRequired>().task_id, task_id)
  const [listing] = await app.db.select().from(gig_details).where(eq(gig_details.escrow_id, task_id))
  assert.strictEqual(listing?.title, 'Photograph the storefront (urgent)')
})

test('one-shot refusals: 401 anonymous, 403 for a human account, 422 without an operation id or with a permit (nothing minted); 400 for a bad listing, whose draft stays for the retry', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const human = await createTransactableUser(app)
  const agent = await registerAgent(app)
  const post = (token: string | null, payload: TaskPost) =>
    app.inject({ method: 'POST', url: URL, headers: token === null ? {} : authHeader(token), payload })
  assert.strictEqual((await post(null, agentTaskBody())).statusCode, 401)
  const asHuman = await post(human.token, agentTaskBody())
  assert.strictEqual(asHuman.statusCode, 403)
  assert.strictEqual(asHuman.json().code, 'FORBIDDEN')
  const { creation_operation_id: _dropped, ...noOperation } = agentTaskBody()
  assert.strictEqual((await post(agent.token, noOperation)).statusCode, 422)
  // The MESSAGE, not only the status: a permit that fails the wire validator is
  // 422 too, so the status alone cannot tell "refused as not part of the
  // one-shot" from "refused as malformed" (measured — the guard dropped, same 422).
  const withPermit = await post(agent.token, { ...agentTaskBody(), permit: { value_raw: '1', deadline_unix: 1, signature: '0x' } })
  assert.strictEqual(withPermit.statusCode, 422)
  assert.match(withPermit.json().message, /not part of the one-shot/)
  const badListing = await post(agent.token, { ...agentTaskBody(), category: 'not-a-category' })
  assert.strictEqual(badListing.statusCode, 400)
  assert.strictEqual(badListing.json().code, 'VALIDATION_ERROR')
  const drafts = await app.db.select({ id: escrows.id }).from(escrows)
  // The bad listing DID mint its draft (terms were valid) and left it a
  // draft with no listing — the retry with a fixed listing lands on it.
  assert.strictEqual(drafts.length, 1)
  assert.strictEqual((await app.db.select().from(gig_details)).length, 0)
})

test('one-shot: a signer_address the agent has not linked is 422 ESCROW_WRONG_WALLET, and nothing is minted', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const res = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: agentTaskBody({ signer_address: agentWalletAddress() }) })
  assert.strictEqual(res.statusCode, 422, res.body)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_WALLET')
  assert.strictEqual((await app.db.select({ id: escrows.id }).from(escrows)).length, 0, 'the gate runs before the draft write')
  // The agent's own (primary) wallet, declared explicitly, is accepted.
  const own = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: agentTaskBody({ signer_address: agent.address }) })
  assert.strictEqual(own.statusCode, 402, own.body)
})

test('one-shot: a direct invite needs the assignee to hold a wallet on the chain (422, nothing minted); with one, the draft records it', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const worker = await createUser(app)
  const body = agentTaskBody({ assigned_counterparty_id: worker.row.id })
  const unlinked = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(unlinked.statusCode, 422, unlinked.body)
  assert.strictEqual(unlinked.json().code, 'ASSIGNEE_WALLET_REQUIRED')
  assert.strictEqual((await app.db.select({ id: escrows.id }).from(escrows)).length, 0)
  const workerWallet = agentWalletAddress().toLowerCase()
  await app.db.insert(user_wallets).values({ chain_ns: 'eip155', address: workerWallet, user_id: worker.row.id, is_primary: true })
  const invited = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: body })
  assert.strictEqual(invited.statusCode, 402, invited.body)
  const [draft] = await app.db.select().from(escrows).where(eq(escrows.id, invited.json<AgentTaskPaymentRequired>().task_id))
  assert.strictEqual(draft?.assigned_counterparty_id, worker.row.id)
  assert.strictEqual(draft?.assigned_counterparty_address, workerWallet, 'the row records the wallet the create will bake')
})

test('one-shot: an agent with NO wallet on the target chain is 403 WALLET_REQUIRED — the contact bypass does not carry the wallet half', { skip }, async () => {
  // `assertCanTransact` lets an agent past the verified-CONTACT gate and says
  // in a comment that "the wallet half above still binds". Nothing proved it:
  // measured, moving the agent bypass above the wallet check left every suite
  // green. An agent registers on the eip155 harness chain, so posting on the
  // Solana one with no wallet linked there is the case.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(agent.token),
    payload: agentTaskBody({ chain_id: TEST_CHAIN_ID, asset: 'USDC_SOL' }),
  })
  assert.strictEqual(res.statusCode, 403, res.body)
  assert.strictEqual(res.json().code, 'WALLET_REQUIRED')
  // The client is told WHICH chain to link for, and nothing was minted.
  assert.strictEqual(res.json().details?.chain_ns, 'solana')
  assert.strictEqual((await app.db.select({ id: escrows.id }).from(escrows)).length, 0)
})

test('one-shot: a chain without a relayer answers 503 after minting the draft; a malformed X-PAYMENT is 400 before any work', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  // The agent's wallet is eip155; the Solana harness chain needs a solana wallet — link one directly.
  await app.db.insert(user_wallets).values({ chain_ns: 'solana', address: `SoAg${agent.response.user.id.replace(/-/g, '')}`, user_id: agent.response.user.id, is_primary: false })
  const onSolana = await app.inject({ method: 'POST', url: URL, headers: authHeader(agent.token), payload: agentTaskBody({ chain_id: TEST_CHAIN_ID, asset: 'USDC_SOL' }) })
  assert.strictEqual(onSolana.statusCode, 503, onSolana.body)
  assert.strictEqual(onSolana.json().code, 'RELAY_UNAVAILABLE')
  const malformed = await app.inject({ method: 'POST', url: URL, headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: 'not-base64-json' }, payload: agentTaskBody() })
  assert.strictEqual(malformed.statusCode, 400)
  assert.strictEqual((await app.db.select({ id: escrows.id }).from(escrows)).length, 1, 'the malformed header minted nothing')
})
