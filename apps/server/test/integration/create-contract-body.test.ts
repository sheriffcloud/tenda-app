/**
 * The published create contract vs what the server actually accepts.
 *
 * `CreateEscrowApiBody` is what every client types its request against, and
 * `CreateEscrowBody` (the server's untrusted-input interface) is a SEPARATE
 * type by design — nothing links them at compile time. So a field can exist on
 * one and not the other, and the only symptom is a client that cannot express
 * a request the server would happily serve.
 *
 * That is exactly what happened with `requires_approval`: the server validated
 * it and the DB stored it while the contract never declared it, which would
 * have blocked the mode picker.
 *
 * This posts a body typed as the CONTRACT and asserts the server honours every
 * field of it. Gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { CreateEscrowApiBody } from '@tenda/shared'
import { escrows } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  makeTransactable,
  authHeader,
  TEST_CHAIN_ID,
  TEST_ASSET,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

function contractBody(over: Partial<CreateEscrowApiBody> = {}): CreateEscrowApiBody {
  return {
    creation_operation_id: randomUUID(),
    kind: 'gig',
    chain_id: TEST_CHAIN_ID,
    asset: TEST_ASSET,
    amount_raw: '1000000',
    accept_deadline_unix: Math.floor(Date.now() / 1000) + 86_400,
    completion_duration_seconds: 7_200,
    dispute_bond_raw: '0',
    ...over,
  }
}

test('a contract body with requires_approval is accepted and persisted', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: contractBody({ requires_approval: true }),
  })
  assert.strictEqual(res.statusCode, 201, res.body)

  const [row] = await app.db
    .select({
      requires_approval: escrows.requires_approval,
      unassign_window_seconds: escrows.unassign_window_seconds,
    })
    .from(escrows)
    .where(eq(escrows.id, res.json().escrow_id))
  assert.strictEqual(row.requires_approval, true, 'the field the contract declares must stick')
  // Stamped from config at create so the row records what the transaction
  // encodes — a zero here would mean the window was never carried through.
  assert.ok(row.unassign_window_seconds > 0)
})

test('repeating one creation operation returns the same draft', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
  const body = contractBody()
  const first = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token), payload: body,
  })
  const retry = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token), payload: body,
  })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(retry.statusCode, 200)
  assert.strictEqual(retry.json().escrow_id, first.json().escrow_id)
})

test('reusing a creation operation for different terms is rejected', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
  const body = contractBody()
  const first = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token), payload: body,
  })
  const conflict = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: { ...body, amount_raw: '2000000' },
  })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(conflict.statusCode, 409)
})

test('concurrent creation retries converge on one draft', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
  const body = contractBody()
  const send = () => app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token), payload: body,
  })
  const responses = await Promise.all([send(), send()])
  assert.deepStrictEqual(responses.map((res) => res.statusCode).sort(), [200, 201])
  assert.strictEqual(responses[0].json().escrow_id, responses[1].json().escrow_id)
  const rows = await app.db.select({ id: escrows.id }).from(escrows)
    .where(eq(escrows.creation_operation_id, body.creation_operation_id))
  assert.strictEqual(rows.length, 1)
})

test('a creation operation is scoped to its creator', { skip }, async () => {
  const app = getApp()
  const firstCreator = await createUser(app)
  const secondCreator = await createUser(app)
  await makeTransactable(app, firstCreator.row.id)
  await makeTransactable(app, secondCreator.row.id)
  const body = contractBody()
  const first = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(firstCreator.token), payload: body,
  })
  const second = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(secondCreator.token), payload: body,
  })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(second.statusCode, 201)
  assert.notStrictEqual(first.json().escrow_id, second.json().escrow_id)
})

test('replaying a creation operation after publication is rejected', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
  const body = contractBody()
  const first = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token), payload: body,
  })
  assert.strictEqual(first.statusCode, 201)
  await app.db.update(escrows).set({ status: 'open', escrow_ref: 'published-ref' })
    .where(eq(escrows.id, first.json().escrow_id))
  const replay = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token), payload: body,
  })
  assert.strictEqual(replay.statusCode, 409)
  assert.strictEqual(replay.json().code, 'ESCROW_WRONG_STATUS')
})

test('omitting requires_approval keeps the pre-existing instant behaviour', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: contractBody(),
  })
  assert.strictEqual(res.statusCode, 201, res.body)
  const [row] = await app.db
    .select({ requires_approval: escrows.requires_approval })
    .from(escrows)
    .where(eq(escrows.id, res.json().escrow_id))
  assert.strictEqual(row.requires_approval, false)
})

// The contracts reject the pair outright, so the poster must find out here
// rather than through a revert after paying gas.
test('the contract cannot express approval mode AND a direct assignee together', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const invitee = await createUser(app)
  await makeTransactable(app, creator.row.id)
  await makeTransactable(app, invitee.row.id)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: contractBody({
      requires_approval: true,
      assigned_counterparty_id: invitee.row.id,
    }),
  })
  assert.strictEqual(res.statusCode, 422)
})

test('approval mode is refused on an exchange, through the real route', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(creator.token),
    payload: contractBody({ kind: 'exchange', requires_approval: true }),
  })
  assert.strictEqual(res.statusCode, 422)
})
