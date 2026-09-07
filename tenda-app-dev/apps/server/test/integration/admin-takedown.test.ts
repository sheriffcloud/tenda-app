/**
 * CO1 admin takedown (#70): PATCH /v1/admin/escrows/:id/hidden flips
 * escrows.hidden; hidden listings vanish from the public gig feed, the
 * exchange order book, and public detail — but stay visible to their
 * parties and to admins, and keep appearing in mine=.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
} from '../helpers/test-app'
import { openGig } from '../helpers/escrow-states'
import { installCapture } from '../helpers/side-effects'
import { wsChannelName } from '@tenda/shared'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

function hideUrl(id: string): string {
  return `/v1/admin/escrows/${id}/hidden`
}

test('takedown: only escrows.takedown holders may toggle', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const disputeAdmin = await createUser(app, { role: 'dispute_admin' })
  const user = await createUser(app)

  const lesser = await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(disputeAdmin.token),
    payload: { hidden: true },
  })
  assert.strictEqual(lesser.statusCode, 403)

  const plain = await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(user.token),
    payload: { hidden: true },
  })
  assert.strictEqual(plain.statusCode, 403)
})

test('takedown: 404 unknown escrow, 400 non-boolean body', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const missing = await app.inject({
    method: 'PATCH',
    url: hideUrl('f0e36d8a-0000-0000-0000-000000000000'),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })
  assert.strictEqual(missing.statusCode, 404)

  const { escrow } = await openGig(app)
  const bad = await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: 'yes' },
  })
  assert.strictEqual(bad.statusCode, 400)
})

test('takedown: hidden gig leaves the feed, unhide restores it', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const admin = await createUser(app, { role: 'super_admin' })

  const hide = await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })
  assert.strictEqual(hide.statusCode, 200)
  assert.deepStrictEqual(hide.json(), { id: escrow.id, hidden: true })

  const hiddenFeed = await app.inject({ method: 'GET', url: '/v1/gigs' })
  assert.strictEqual(hiddenFeed.json().total, 0)

  const unhide = await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: false },
  })
  assert.strictEqual(unhide.statusCode, 200)
  const restored = await app.inject({ method: 'GET', url: '/v1/gigs' })
  assert.strictEqual(restored.json().total, 1)
})

test('takedown: hidden gig detail — 404 public, 200 creator/admin, mine= keeps it', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const stranger = await createUser(app)
  await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })

  const anon = await app.inject({ method: 'GET', url: `/v1/gigs/${escrow.id}` })
  assert.strictEqual(anon.statusCode, 404)
  const other = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(other.statusCode, 404)

  const own = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(own.statusCode, 200)
  const adminView = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(adminView.statusCode, 200)

  const mine = await app.inject({
    method: 'GET',
    url: '/v1/gigs?mine=created',
    headers: authHeader(creator.token),
  })
  assert.strictEqual(mine.json().total, 1)
})

test('takedown: hidden exchange offer leaves the order book + detail 404s', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const stranger = await createUser(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(app, escrow.id)

  const before = await app.inject({
    method: 'GET',
    url: '/v1/exchange',
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(before.json().total, 1)

  await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })

  const after = await app.inject({
    method: 'GET',
    url: '/v1/exchange',
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(after.json().total, 0)

  const detail = await app.inject({
    method: 'GET',
    url: `/v1/exchange/${escrow.id}`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(detail.statusCode, 404)
  const own = await app.inject({
    method: 'GET',
    url: `/v1/exchange/${escrow.id}`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(own.statusCode, 200)
})

test('takedown: admin escrow browser surfaces the hidden flag', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })
  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/escrows/${escrow.id}`,
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().hidden, true)
})

// ── live invalidation ───────────────────────────────────────────────────────
//
// `hidden` began life as a READ filter, which reaches a screen only when that
// screen asks again. The frame below is what reaches the screens already OPEN:
// `useEscrowLiveRefresh` is subscribed to this channel and refetches on any
// frame, so the party re-reads with the takedown notice and everyone else gets
// the 404 the detail route now serves them.
//
// Asserted in BOTH directions. A hide-only fix leaves a restored listing dead
// on screen — the same bug, pointing the other way, and the one nobody would
// think to check by hand.

test('takedown: hiding and unhiding each publish an escrow-channel frame', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const capture = installCapture(app)

  async function toggle(hidden: boolean): Promise<void> {
    const res = await app.inject({
      method: 'PATCH',
      url: hideUrl(escrow.id),
      headers: authHeader(admin.token),
      payload: { hidden },
    })
    assert.strictEqual(res.statusCode, 200, `PATCH hidden=${hidden}`)
  }

  await toggle(true)
  await toggle(false)

  const frames = capture.broadcasts.filter((b) => b.channel === wsChannelName('escrow', escrow.id))
  assert.strictEqual(frames.length, 2, 'expected one frame per toggle, hide AND unhide')
  for (const frame of frames) {
    // The shape the client's guard requires (realtime.store `isEscrowEventFrame`):
    // anything else is dropped silently, which would look exactly like no fix.
    assert.strictEqual(frame.payload.type, 'escrow_event')
    assert.strictEqual(frame.payload.escrow_id, escrow.id)
    assert.strictEqual(typeof frame.payload.event, 'string')
    assert.strictEqual(typeof frame.payload.tx_ref, 'string')
  }
})

test('takedown: the frame cannot be mistaken for a transaction confirming', { skip }, async () => {
  // TransactionMonitor settles a pending tx when a frame's `tx_ref` matches its
  // signature. A takedown signs nothing, so it must carry an EMPTY ref — a
  // borrowed or invented one would dismiss the progress modal of whatever the
  // user happened to have in flight, reporting a failure as a success.
  const app = getApp()
  const { escrow } = await openGig(app)
  const admin = await createUser(app, { role: 'super_admin' })
  const capture = installCapture(app)

  await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })

  const [frame] = capture.broadcasts.filter(
    (b) => b.channel === wsChannelName('escrow', escrow.id),
  )
  assert.notStrictEqual(frame, undefined, 'no frame was published')
  assert.strictEqual(frame.payload.tx_ref, '')
})

test('takedown: a failed toggle publishes nothing', { skip }, async () => {
  // The frame follows the write, never precedes it: a 404 or a rejected body
  // must not tell every open screen to re-read for a change that did not happen.
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const { escrow } = await openGig(app)
  const capture = installCapture(app)

  const badBody = await app.inject({
    method: 'PATCH',
    url: hideUrl(escrow.id),
    headers: authHeader(admin.token),
    payload: { hidden: 'yes' },
  })
  assert.strictEqual(badBody.statusCode, 400)

  const missing = await app.inject({
    method: 'PATCH',
    url: hideUrl('f0e36d8a-0000-0000-0000-000000000000'),
    headers: authHeader(admin.token),
    payload: { hidden: true },
  })
  assert.strictEqual(missing.statusCode, 404)

  assert.deepStrictEqual(capture.broadcasts, [])
})
