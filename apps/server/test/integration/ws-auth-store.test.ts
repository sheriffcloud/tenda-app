/**
 * `drizzleWsAuthStore` — the REAL WS channel-authorisation queries.
 *
 * test/unit/ws.test.ts covers `authorizeChannel`'s branching against a
 * hand-rolled mock store, so until now the store's actual SQL never ran in any
 * test. That mattered for two reasons:
 *
 *   1. The escrow channel deliberately uses the WIDER party notion
 *      (`isEscrowPartyOrAssigned`) so a direct-offer invitee can subscribe
 *      before accepting. That arm is the ONLY thing distinguishing it from
 *      `isEscrowParty`, and nothing exercised it.
 *   2. Both id columns are postgres `uuid` while `parseChannel` accepts any
 *      non-empty string, so a malformed channel id used to reach the driver.
 *
 * Gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conversations } from '@tenda/shared/db/schema'
import { drizzleWsAuthStore } from '@server/lib/ws'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  type TestUser,
} from '../helpers/test-app'
import type { FastifyInstance } from 'fastify'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const storeFor = (app: FastifyInstance) => drizzleWsAuthStore(app.db)

test('only existing active users pass WebSocket account authentication', { skip }, async () => {
  const app = getApp()
  const active = await createUser(app)
  const suspended = await createUser(app, { status: 'suspended' })

  assert.equal(await storeFor(app).isActiveUser(active.row.id), true)
  assert.equal(await storeFor(app).isActiveUser(suspended.row.id), false)
  assert.equal(await storeFor(app).isActiveUser('550e8400-e29b-41d4-a716-446655440000'), false)
  assert.equal(await storeFor(app).isActiveUser('not-a-uuid'), false)
})

/** Canonical (user_a_id < user_b_id) conversation between two users. */
async function conversationBetween(
  app: FastifyInstance,
  x: TestUser,
  y: TestUser,
): Promise<string> {
  const [a, b] = [x.row.id, y.row.id].sort()
  const [row] = await app.db
    .insert(conversations)
    .values({ user_a_id: a, user_b_id: b })
    .returning({ id: conversations.id })
  return row.id
}

// ---------- escrow channel ----------------------------------------------

test('the creator may subscribe to their escrow', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: poster.row.id })

  assert.equal(await storeFor(app).isEscrowPartyOrAssigned(escrow.id, poster.row.id), true)
})

test('the accepted counterparty may subscribe', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
  })

  assert.equal(await storeFor(app).isEscrowPartyOrAssigned(escrow.id, worker.row.id), true)
})

/**
 * THE case this file exists for. A direct-offer invitee is
 * `assigned_counterparty_id` with `counterparty_id` still NULL — they have not
 * accepted yet, but they must be able to watch the escrow they were offered.
 * The settled-parties predicate would return false here.
 */
test('a pending assignee may subscribe before accepting', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const invitee = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: null,
    assigned_counterparty_id: invitee.row.id,
    status: 'open',
  })

  assert.equal(await storeFor(app).isEscrowPartyOrAssigned(escrow.id, invitee.row.id), true)
})

test('a stranger may not subscribe', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const stranger = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
  })

  assert.equal(await storeFor(app).isEscrowPartyOrAssigned(escrow.id, stranger.row.id), false)
})

/**
 * `unassign` clears BOTH columns, which is what drops the released worker.
 * Pinned so a future patch that leaves one behind can't silently keep them
 * subscribed to an escrow they are no longer on.
 */
test('a released worker loses access once both columns are cleared', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: null,
    assigned_counterparty_id: null,
    status: 'open',
  })

  assert.equal(await storeFor(app).isEscrowPartyOrAssigned(escrow.id, worker.row.id), false)
})

test('an escrow that does not exist is a plain no', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)

  assert.equal(
    await storeFor(app).isEscrowPartyOrAssigned('550e8400-e29b-41d4-a716-446655440000', user.row.id),
    false,
  )
})

// ---------- chat channel ------------------------------------------------

test('a conversation member may subscribe, on either side', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const id = await conversationBetween(app, a, b)

  assert.equal(await storeFor(app).isConversationMember(id, a.row.id), true)
  assert.equal(await storeFor(app).isConversationMember(id, b.row.id), true)
})

test('a non-member may not subscribe to a conversation', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const outsider = await createUser(app)
  const id = await conversationBetween(app, a, b)

  assert.equal(await storeFor(app).isConversationMember(id, outsider.row.id), false)
})

// ---------- malformed ids -----------------------------------------------

/**
 * `parseChannel` accepts any non-empty string after the prefix, so these reach
 * the store verbatim. Both id columns are `uuid`: without the short-circuit
 * the driver raises `invalid input syntax for type uuid`, turning a frame that
 * deserves "no" into a thrown query and a logged warning apiece.
 */
test('a malformed escrow id returns false instead of throwing', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const store = storeFor(app)

  for (const bad of ['notauuid', '', 'x', '550e8400-e29b-41d4-a716', "'; drop table escrows;--"]) {
    assert.equal(
      await store.isEscrowPartyOrAssigned(bad, user.row.id),
      false,
      `escrow id ${JSON.stringify(bad)} should be a plain false`,
    )
  }
})

test('a malformed conversation id returns false instead of throwing', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const store = storeFor(app)

  for (const bad of ['notauuid', '', 'chat-1', '550e8400-e29b-41d4-a716-44665544000z']) {
    assert.equal(
      await store.isConversationMember(bad, user.row.id),
      false,
      `conversation id ${JSON.stringify(bad)} should be a plain false`,
    )
  }
})
