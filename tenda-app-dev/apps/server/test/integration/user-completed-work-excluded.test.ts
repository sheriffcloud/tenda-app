/**
 * GET /v1/users/:id/completed-work — WHAT IT DOES NOT COUNT, and who may ask.
 *
 * The counts themselves, and their agreement with the profile's "Completed"
 * stat, are in user-completed-work.test.ts. This half is the boundary: gigs
 * posted rather than delivered, escrows that never finished, other people's
 * work, rows that are not gigs at all, and a category the client could not
 * render — plus the disclosure rule, which is that the answer is rolled up and
 * public exactly as /v1/users/:id/standing already is.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { gig_details } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
} from '../helpers/test-app'
import { hideEscrow, openGig } from '../helpers/escrow-states'
import { completedStat, completedWork, sum, workedGig } from '../helpers/completed-work'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- what is NOT counted --------------------------------------------

test('counts work DELIVERED, never gigs POSTED', { skip }, async () => {
  // The distinction the block's own heading makes. A poster whose gigs were all
  // completed by other people has done no work themselves.
  const app = getApp()
  const worker = await createUser(app)
  const poster = await createUser(app)
  await openGig(app, {
    category: 'errand',
    escrow: { status: 'completed', creator_id: poster.row.id, counterparty_id: worker.row.id },
  })

  assert.deepEqual(await completedWork(app, worker.row.id), [{ category: 'errand', count: 1 }])
  assert.deepEqual(await completedWork(app, poster.row.id), [])
})

test('an unfinished gig is not work done — only `completed` counts', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  await workedGig(app, worker, 'delivery', { status: 'accepted' })
  await workedGig(app, worker, 'delivery', { status: 'submitted' })
  await workedGig(app, worker, 'delivery', { status: 'disputed' })
  await workedGig(app, worker, 'delivery', { status: 'refunded' })
  await workedGig(app, worker, 'delivery', { status: 'cancelled' })
  await workedGig(app, worker, 'delivery', { status: 'completed' })

  const data = await completedWork(app, worker.row.id)

  assert.deepEqual(data, [{ category: 'delivery', count: 1 }])
  assert.equal(sum(data), await completedStat(app, worker))
})

test("another user's completed work is not counted", { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  const stranger = await createUser(app)
  await workedGig(app, worker, 'photo')
  await workedGig(app, stranger, 'photo')
  await workedGig(app, stranger, 'photo')

  assert.deepEqual(await completedWork(app, worker.row.id), [{ category: 'photo', count: 1 }])
  assert.deepEqual(await completedWork(app, stranger.row.id), [{ category: 'photo', count: 2 }])
})

test('an exchange escrow has no category and is not counted', { skip }, async () => {
  // Exchanges are the other `kind` on the same table, with no gig_details row.
  const app = getApp()
  const worker = await createUser(app)
  const seller = await createUser(app)
  await createEscrow(app, {
    creator_id: seller.row.id,
    counterparty_id: worker.row.id,
    kind: 'exchange',
    status: 'completed',
  })
  await workedGig(app, worker, 'service')

  const data = await completedWork(app, worker.row.id)
  assert.deepEqual(data, [{ category: 'service', count: 1 }])
})

test('gig_details hanging off an EXCHANGE escrow is still not gig work', { skip }, async () => {
  // What separates the route's `kind = 'gig'` from its join. The join alone
  // drops an exchange because no satellite row exists — so the test above
  // passes either way, and this one is what stops the guard being a line
  // nothing can justify. POST /v1/gigs refuses to attach details to a
  // non-gig escrow (409), so the row is written directly, which is the only
  // way this state exists.
  const app = getApp()
  const worker = await createUser(app)
  const seller = await createUser(app)
  const exchange = await createEscrow(app, {
    creator_id: seller.row.id,
    counterparty_id: worker.row.id,
    kind: 'exchange',
    status: 'completed',
  })
  await attachGigDetails(app, exchange.id, { category: 'delivery' })

  assert.deepEqual(await completedWork(app, worker.row.id), [])
})

test('a category outside the vocabulary is dropped rather than served', { skip }, async () => {
  // `gig_details.category` is a text column: the write path validates, but a
  // row that predates a renamed category would still be readable here, and the
  // client has no label, icon or tone for a key it does not know.
  const app = getApp()
  const worker = await createUser(app)
  const strange = await workedGig(app, worker, 'service')
  await workedGig(app, worker, 'delivery')
  await app.db
    .update(gig_details)
    .set({ category: 'taxidermy' })
    .where(eq(gig_details.escrow_id, strange))

  assert.deepEqual(await completedWork(app, worker.row.id), [{ category: 'delivery', count: 1 }])
})

test('a taken-down listing still counts as work the worker delivered', { skip }, async () => {
  // Deliberate, and the same answer `mine=working` gives: hiding a LISTING
  // removes the ways into it, it does not unmake the delivery or edit the
  // worker's record. Pinned because a reader would reasonably wonder, and
  // because the chips and the stat have to agree either way.
  const app = getApp()
  const worker = await createUser(app)
  const hidden = await workedGig(app, worker, 'errand')
  await hideEscrow(app, hidden)

  const data = await completedWork(app, worker.row.id)

  assert.deepEqual(data, [{ category: 'errand', count: 1 }])
  assert.equal(sum(data), await completedStat(app, worker))
})

// ---------- who may ask -----------------------------------------------------

test('served to an anonymous caller, exactly like /standing', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  await workedGig(app, worker, 'delivery')
  const url = `/v1/users/${worker.row.id}/completed-work`

  const anonymous = await app.inject({ method: 'GET', url })

  assert.equal(anonymous.statusCode, 200)
  assert.deepEqual(anonymous.json().data, [{ category: 'delivery', count: 1 }])

  // And a BROKEN credential is not a reason to refuse a public answer. This is
  // the arm that breaks the day someone adds a global token-parsing hook: the
  // no-header case would still pass, because a hook with nothing to parse has
  // nothing to reject.
  for (const authorization of ['Bearer not.a.jwt', 'Bearer ', 'nonsense']) {
    const res = await app.inject({ method: 'GET', url, headers: { authorization } })
    assert.equal(res.statusCode, 200, `rejected a public read for header: ${authorization}`)
    assert.deepEqual(res.json().data, [{ category: 'delivery', count: 1 }])
  }
})

test('rolled up only — no escrow id, title, amount or counterparty leaks', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  const poster = await createUser(app)
  await openGig(app, {
    title: 'Secret client brief',
    category: 'digital',
    escrow: { status: 'completed', creator_id: poster.row.id, counterparty_id: worker.row.id },
  })

  const res = await app.inject({ method: 'GET', url: `/v1/users/${worker.row.id}/completed-work` })
  const body = res.payload

  assert.equal(body.includes('Secret client brief'), false)
  assert.equal(body.includes(poster.row.id), false)
  assert.deepEqual(Object.keys(res.json()), ['data'])
  assert.deepEqual(Object.keys(res.json().data[0]).sort(), ['category', 'count'])
})

test('an unknown user is 404, which an empty block cannot say', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: `/v1/users/${randomUUID()}/completed-work` })

  assert.equal(res.statusCode, 404)
  assert.equal(res.json().code, 'USER_NOT_FOUND')
})

test('a malformed id is the same 404, not a 500 from postgres', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/users/not-a-uuid/completed-work' })

  assert.equal(res.statusCode, 404)
  assert.equal(res.json().code, 'USER_NOT_FOUND')
})
