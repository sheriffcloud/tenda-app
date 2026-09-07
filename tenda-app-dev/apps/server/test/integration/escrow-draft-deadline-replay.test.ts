/**
 * The accept window is the CALLER's; the deadline is the SERVER's (#41).
 *
 * #32's symptom was a replay refused for a change the caller never made: the
 * body carried an absolute deadline, `prepareDraftCreate` rewrote it when it
 * was about to lapse, and `matchesTerms` then compared the rewritten column
 * against the instant that had been sent. The fix there was to stop comparing
 * it, which cost the term entirely.
 *
 * #41 removed the shape instead of the comparison. The caller sends a DURATION,
 * the server derives `accept_deadline` at the moment it builds the transaction,
 * and the two facts stop overlapping: the window is caller-authored and never
 * rewritten, so it can be compared, and the deadline is server-owned and never
 * compared. This suite holds both halves.
 *
 * Both entry points are exercised: the human POST /v1/escrows retried after
 * build-create, and the agent one-shot's 402 → X-PAYMENT resend (whose quote
 * goes through the same preparation).
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { escrows } from '@tenda/shared/db/schema'
import {
  type AgentTaskCreated,
  type AgentTaskPaymentRequired,
  apiRoutes,
  MIN_ACCEPT_WINDOW_SECONDS,
  RELAY_QUOTE_TTL_SECONDS,
  X_PAYMENT_HEADER,
} from '@tenda/shared'
import {
  TEST_CHAIN_ID,
  TEST_DB_CONFIGURED,
  authHeader,
  createTransactableUser,
  seedAltChain,
  useTestApp,
  type TestUser,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'
import { agentPaymentHeader, agentTaskBody, registerAgent } from '../helpers/agent'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** A window well inside the rail, used wherever the exact value does not matter. */
const WINDOW_SECONDS = 24 * 3600

type CreateEscrowRequestBody = ReturnType<typeof createEscrowBody>

function post(
  app: FastifyInstance,
  user: TestUser,
  payload: CreateEscrowRequestBody,
): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url: '/v1/escrows', headers: authHeader(user.token), payload })
}

function buildCreate(app: FastifyInstance, user: TestUser, id: string): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: `/v1/escrows/${id}/build-create`,
    headers: authHeader(user.token),
  })
}

async function deadlineOf(app: FastifyInstance, id: string): Promise<number> {
  const [row] = await app.db
    .select({ accept_deadline: escrows.accept_deadline })
    .from(escrows)
    .where(eq(escrows.id, id))
  assert.ok(row?.accept_deadline, 'the draft carries a deadline')
  return row.accept_deadline.getTime()
}

/**
 * Record the `accept_deadline_unix` every createEscrow build encodes while
 * `body` runs. The harness's fake adapter is already this suite's one
 * substitution; restoring it in `finally` is load-bearing (it is shared).
 */
async function withCapturedDeadlines(
  app: FastifyInstance,
  body: () => Promise<void>,
): Promise<number[]> {
  const adapter = app.chains.get(TEST_CHAIN_ID)
  const original = adapter.buildTx
  const seen: number[] = []
  adapter.buildTx = async (build) => {
    if (build.action === 'createEscrow') seen.push(build.payload.accept_deadline_unix)
    return original(build)
  }
  try {
    await body()
  } finally {
    adapter.buildTx = original
  }
  return seen
}

test('a draft that has sat past its deadline still builds a LIVE one', { skip }, async () => {
  // The property #41 exists for. Both programs reject a create whose accept
  // window has already closed, and a draft can be composed on Monday and
  // published on Thursday. Anchoring on the build — not on the body, and not on
  // created_at — is what makes staleness unreachable rather than patched.
  const app = getApp()
  const user = await createTransactableUser(app)
  const body = createEscrowBody({ creation_operation_id: randomUUID(), accept_window_seconds: WINDOW_SECONDS })

  const first = await post(app, user, body)
  assert.strictEqual(first.statusCode, 201, first.body)
  const escrow_id: string = first.json().escrow_id

  // Age the draft past its own deadline, exactly as sitting for days would.
  const stale = new Date(Date.now() - 60_000)
  await app.db.update(escrows).set({ accept_deadline: stale }).where(eq(escrows.id, escrow_id))

  const encoded = await withCapturedDeadlines(app, async () => {
    assert.strictEqual((await buildCreate(app, user, escrow_id)).statusCode, 200)
  })

  const nowUnix = Math.floor(Date.now() / 1000)
  assert.strictEqual(encoded.length, 1)
  assert.ok(encoded[0] > nowUnix, 'the transaction encodes a deadline in the FUTURE')
  // And it is the window measured from the build, not from the stale row.
  assert.ok(
    Math.abs(encoded[0] - (nowUnix + WINDOW_SECONDS)) <= 5,
    `expected ~now + ${WINDOW_SECONDS}s, got ${encoded[0] - nowUnix}s out`,
  )
  assert.ok(await deadlineOf(app, escrow_id) > Date.now(), 'the row was re-stamped with it')
})

test('a REPLAY of a stale draft also builds a live deadline, not the row’s', { skip }, async () => {
  // The other way into a build. POST /v1/escrows answers a replayed operation
  // with a rebuilt transaction taken straight off the stored row — it does not
  // go through `prepareDraftCreate`, so it is a second place the same staleness
  // can reach a signer. A draft older than its own window replayed here would
  // hand the caller a transaction both programs reject, after they paid gas.
  const app = getApp()
  const user = await createTransactableUser(app)
  const body = createEscrowBody({ creation_operation_id: randomUUID(), accept_window_seconds: WINDOW_SECONDS })

  const first = await post(app, user, body)
  assert.strictEqual(first.statusCode, 201, first.body)
  const escrow_id: string = first.json().escrow_id

  const stale = new Date(Date.now() - 60_000)
  await app.db.update(escrows).set({ accept_deadline: stale }).where(eq(escrows.id, escrow_id))

  const encoded = await withCapturedDeadlines(app, async () => {
    const replay = await post(app, user, body)
    assert.strictEqual(replay.statusCode, 200, replay.body)
    assert.strictEqual(replay.json().escrow_id, escrow_id, 'still the same draft')
  })

  const nowUnix = Math.floor(Date.now() / 1000)
  assert.strictEqual(encoded.length, 1)
  assert.ok(encoded[0] > nowUnix, 'the replayed transaction encodes a deadline in the FUTURE')
  // And the row was re-stamped with exactly it: a row that disagreed with the
  // transaction it just handed out is the other half of the same defect.
  assert.strictEqual(
    Math.floor((await deadlineOf(app, escrow_id)) / 1000),
    encoded[0],
    'the row holds the instant the transaction encodes',
  )
})

test('create replay: the identical body replays the same draft', { skip }, async () => {
  // #32's regression, still guarded — now trivially, because nothing the server
  // owns is part of the comparison any more.
  const app = getApp()
  const user = await createTransactableUser(app)
  const body = createEscrowBody({ creation_operation_id: randomUUID(), accept_window_seconds: WINDOW_SECONDS })

  const first = await post(app, user, body)
  assert.strictEqual(first.statusCode, 201, first.body)
  const escrow_id: string = first.json().escrow_id
  assert.strictEqual((await buildCreate(app, user, escrow_id)).statusCode, 200)

  const replay = await post(app, user, body)
  assert.strictEqual(replay.statusCode, 200, replay.body)
  assert.strictEqual(replay.json().escrow_id, escrow_id, 'the same draft, not a second escrow')
  assert.ok(replay.json().unsigned, 'the caller still gets something to sign')
})

test('create replay: a term the CALLER changed is still refused', { skip }, async () => {
  // The control for the test above: dropping the deadline from the comparison
  // must not have dropped the comparison. Same operation id, one real change.
  const app = getApp()
  const user = await createTransactableUser(app)
  const operation_id = randomUUID()
  const body = createEscrowBody({ creation_operation_id: operation_id, amount_raw: '1000000' })

  assert.strictEqual((await post(app, user, body)).statusCode, 201)

  for (const changed of [
    { amount_raw: '2000000' },
    { completion_duration_seconds: 7_200 },
    { dispute_bond_raw: '500' },
    // RESTORED by #41. Under #32 this replayed silently, because the deadline
    // the caller sent was not comparable — the server rewrote it. A duration is
    // never rewritten, so a different one is a genuine change of terms again.
    { accept_window_seconds: 48 * 3600 },
  ]) {
    const res = await post(app, user, { ...body, ...changed })
    assert.strictEqual(res.statusCode, 409, `${JSON.stringify(changed)} → ${res.body}`)
    assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
    assert.strictEqual(
      res.json().message,
      'creation_operation_id was already used with different escrow terms',
    )
  }
})

test('create replay: a caller-changed WINDOW is refused, not silently replayed', { skip }, async () => {
  // The cost #32 accepted, and #41 gives back. Reusing an operation id with a
  // different accept window used to replay the first draft and hand back a
  // deadline the caller had not asked for — the only honest answer available
  // while the server owned that field. Now it is a 409 like every other term.
  const app = getApp()
  const user = await createTransactableUser(app)
  const operation_id = randomUUID()
  const body = createEscrowBody({ creation_operation_id: operation_id, accept_window_seconds: 12 * 3600 })

  const created = await post(app, user, body)
  assert.strictEqual(created.statusCode, 201, created.body)
  const escrow_id: string = created.json().escrow_id

  const changed = await post(app, user, { ...body, accept_window_seconds: 48 * 3600 })
  assert.strictEqual(changed.statusCode, 409, changed.body)
  assert.strictEqual(changed.json().code, 'VALIDATION_ERROR')

  // The first draft is untouched by the refused resend.
  const [row] = await app.db
    .select({ window: escrows.accept_window_seconds })
    .from(escrows)
    .where(eq(escrows.id, escrow_id))
  assert.strictEqual(row?.window, 12 * 3600, 'the refused resend rewrote nothing')
})

test('one-shot: the 402 → X-PAYMENT resend still lands on ONE draft', { skip }, async () => {
  // The agent round trip is a resend by construction: the same body goes out
  // twice, once to be quoted and once with the payment. Under #32 the quote
  // itself moved the deadline, so the second call was refused for the server's
  // own edit. With the window caller-owned there is nothing left to move.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  const body = agentTaskBody({ accept_window_seconds: WINDOW_SECONDS })

  const quote = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(agent.token),
    payload: body,
  })
  assert.strictEqual(quote.statusCode, 402, quote.body)
  const task_id = quote.json<AgentTaskPaymentRequired>().task_id

  const paid = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: { ...authHeader(agent.token), [X_PAYMENT_HEADER]: agentPaymentHeader(agent.address) },
    payload: body,
  })
  assert.strictEqual(paid.statusCode, 201, paid.body)
  const created = paid.json<AgentTaskCreated>()
  assert.strictEqual(created.task_id, task_id, 'the draft the 402 quoted, not a second one')
  assert.strictEqual(created.recorded, true)

  const drafts = await app.db.select({ id: escrows.id }).from(escrows)
  assert.strictEqual(drafts.length, 1, 'one draft across both calls')
})

test('one-shot: an out-of-range window is refused before any draft exists', { skip }, async () => {
  // #40, now a property of the type rather than a missing check.
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)

  const res = await app.inject({
    method: 'POST',
    url: apiRoutes.agent.tasks,
    headers: authHeader(agent.token),
    payload: agentTaskBody({ accept_window_seconds: Date.now() }), // milliseconds, the #40 shape
  })

  assert.strictEqual(res.statusCode, 422, res.body)
  assert.match(res.json().message, /accept_window_seconds/)
  const drafts = await app.db.select({ id: escrows.id }).from(escrows)
  assert.strictEqual(drafts.length, 0, 'a refused body leaves nothing behind')
})

test('two builds of the same draft encode the SAME accept deadline', { skip }, async () => {
  // The agent one-shot signs an EIP-3009 authorization whose nonce is
  // keccak256 of the create params, and `acceptDeadline` is INSIDE that struct
  // (chains/evm/create-params.ts). The 402 quote and the X-PAYMENT resend each
  // go through the same preparation, so a deadline re-derived from the clock on
  // both gives two different nonces the moment the pair straddles a one-second
  // boundary — and the relay then refuses the agent's own signature with
  // "authorization.nonce must be the hash of the quoted create parameters".
  //
  // Real agents take longer than a second to sign, so this is not a race the
  // flow occasionally loses; it is one it almost always loses. MEASURED: the
  // evm-relay anvil suite failed on exactly that message.
  const app = getApp()
  const user = await createTransactableUser(app)
  const body = createEscrowBody({ creation_operation_id: randomUUID(), accept_window_seconds: WINDOW_SECONDS })

  const first = await post(app, user, body)
  assert.strictEqual(first.statusCode, 201, first.body)
  const escrow_id: string = first.json().escrow_id

  const encoded = await withCapturedDeadlines(app, async () => {
    assert.strictEqual((await buildCreate(app, user, escrow_id)).statusCode, 200)
    await new Promise((resolve) => setTimeout(resolve, 1_100)) // cross a second boundary
    assert.strictEqual((await buildCreate(app, user, escrow_id)).statusCode, 200)
  })

  assert.strictEqual(encoded.length, 2)
  assert.strictEqual(
    encoded[0],
    encoded[1],
    'the second build re-derived the deadline, invalidating a nonce an agent may already have signed',
  )
})

test('the accept-window floor must outlast a relay quote, or the nonce fix is inert', () => {
  // Not DB-backed, so it runs everywhere — this guards an invariant, not a route.
  //
  // `deriveAcceptDeadline` — the rule both build paths share — reuses a stored
  // deadline only while it outlives `now + RELAY_QUOTE_TTL_SECONDS`. A freshly
  // derived one is `now + accept_window_seconds`, so reuse can only happen if the SMALLEST
  // window a caller may choose is longer than a quote's life. Raise the quote
  // TTL above that floor — a natural change the first time an agent needs
  // longer to sign — and every build re-derives again, silently restoring the
  // failure where the relay refuses the agent's own signature.
  assert.ok(
    MIN_ACCEPT_WINDOW_SECONDS > RELAY_QUOTE_TTL_SECONDS,
    `the shortest accept window (${MIN_ACCEPT_WINDOW_SECONDS}s) must exceed the relay quote TTL ` +
      `(${RELAY_QUOTE_TTL_SECONDS}s), or a quote and its payment can never agree on a deadline`,
  )
})
