/**
 * POST /v1/blockchain/transaction — the body rails (#105 T6).
 *
 * The client-ping route: after broadcasting a transaction the client posts its
 * reference here, the attempt is recorded and an idempotent verify-tx job is
 * enqueued. Three refusals guard the body and none had ever run.
 *
 * WHY THEY MATTER MORE THAN A TYPICAL 400. What gets past them is written to
 * `tx_attempts` and turned into a queue job keyed on (chain_id, tx_ref). A
 * `chain_id` the registry does not carry would be persisted and then handed to
 * `fastify.chains.get()` on the next line, and an `action` outside the escrow
 * vocabulary would be stored as a transaction type nothing can decode. These are
 * the boundary between an authenticated client and the verification pipeline.
 *
 * The route answers 400 for the two shape guards and 422 for the registry one —
 * a real distinction under the #60 rule (uninterpretable vs. understood but
 * refused), and one a status-only assertion on a single case would blur, so
 * each case names its own field.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  UNREGISTERED_CHAIN_ID,
  useTestApp,
  createUser,
  authHeader,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** A well-formed Solana signature shape; the route only checks it is a non-empty string. */
const TX_REF = '5'.repeat(64)

function ping(app: ReturnType<typeof getApp>, u: TestUser, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/v1/blockchain/transaction',
    headers: authHeader(u.token),
    payload: body,
  })
}

/** The body every case starts from, so each case varies exactly one field. */
function validBody(): Record<string, unknown> {
  return { tx_ref: TX_REF, action: 'create', chain_id: TEST_CHAIN_ID }
}

test('client ping: a missing or empty tx_ref is 400', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)

  for (const tx_ref of [undefined, '', 42, null]) {
    const res = await ping(app, u, { ...validBody(), tx_ref })
    assert.strictEqual(res.statusCode, 400, String(tx_ref))
    assert.match(res.json().message, /tx_ref is required/)
  }
})

test('client ping: an action outside the escrow vocabulary is 400', { skip }, async () => {
  // `isEscrowTxType` is the vocabulary, and it is SHORT VERBS —
  // create/accept/submit/approve/cancel/dispute/resolve and friends, not
  // `create_escrow`. Worth stating because the first draft of this case had it
  // backwards: it listed 'create' as invalid (it is valid, and returned 202) and
  // used 'create_escrow' as the happy path (it is not a member). Running it is
  // what settled the vocabulary; reading the enum is what fixed it.
  //
  // The values below are the plausible near-misses: the verb-plus-noun form,
  // a wrong case, and a non-string.
  const app = getApp()
  const u = await createUser(app)

  for (const action of [undefined, '', 'create_escrow', 'cancel_escrow', 'CREATE', 7]) {
    const res = await ping(app, u, { ...validBody(), action })
    assert.strictEqual(res.statusCode, 400, String(action))
    assert.match(res.json().message, /action is not a known escrow action/)
  }
})

test('client ping: a chain the registry does not carry is 422', { skip }, async () => {
  // A WELL-FORMED CAIP-2 id that this deployment does not run — the same
  // distinction the browse surfaces make (chain-filter): unknown ids are
  // refused rather than accepted and quietly producing nothing. 422 not 400,
  // because the field parses fine and is refused on its content.
  const app = getApp()
  const u = await createUser(app)

  for (const chain_id of [UNREGISTERED_CHAIN_ID, undefined, '', 'not-a-caip2', 99]) {
    const res = await ping(app, u, { ...validBody(), chain_id })
    assert.strictEqual(res.statusCode, 422, String(chain_id))
    assert.match(res.json().message, /chain_id is not registered/)
  }
})

test('client ping: the rails refuse in a FIXED order', { skip }, async () => {
  // Two of the three answer the same 400 and differ only in the message, so
  // which fires first is the whole of what a caller learns. A body that is wrong
  // in every way must report tx_ref, then action, then chain_id — the order the
  // handler reads them in.
  const app = getApp()
  const u = await createUser(app)

  const allBad = await ping(app, u, { tx_ref: '', action: 'nope', chain_id: 'nope' })
  assert.strictEqual(allBad.statusCode, 400)
  assert.match(allBad.json().message, /tx_ref is required/)

  const actionAndChain = await ping(app, u, { tx_ref: TX_REF, action: 'nope', chain_id: 'nope' })
  assert.strictEqual(actionAndChain.statusCode, 400)
  assert.match(actionAndChain.json().message, /action is not a known escrow action/)
})

test('client ping: a valid body is accepted (the control)', { skip }, async () => {
  // Without it every refusal above is satisfiable by a handler that rejects
  // everything. 202 rather than 200: verification is never in the request path.
  const app = getApp()
  const u = await createUser(app)

  const res = await ping(app, u, validBody())
  assert.strictEqual(res.statusCode, 202, res.body)
})

test('client ping: an unauthenticated call never reaches the rails', { skip }, async () => {
  // The rails sit behind `authenticate`, so a caller with no token is refused
  // before any body validation — a 400 here would mean the guards had been
  // hoisted above auth and were readable by anyone.
  const app = getApp()
  const res = await app.inject({
    method: 'POST',
    url: '/v1/blockchain/transaction',
    payload: { tx_ref: '', action: 'nope', chain_id: 'nope' },
  })
  assert.strictEqual(res.statusCode, 401)
})
