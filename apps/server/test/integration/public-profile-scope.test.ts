/**
 * How much of a person `GET /v1/users/:id` gives up, and to whom (#180).
 *
 * The route is still ANONYMOUS — the gig detail links here and that page is the
 * indexable front door — but it no longer answers everyone the same way. #175
 * stopped the exchange book PUBLISHING a seller's legal name and face; this
 * route was handing them back to anyone who could type an id, so the pairing
 * that #175 removed cost one extra request to rebuild. Now the legal name and
 * the face need a SETTLED escrow between the reader and the subject.
 *
 * The cases that matter are the negative ones, and they assert on the RAW body:
 * a leak through a key nobody thought to check still fails.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abbreviatedName, apiRoutes, type PublicUser } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  attachExchangeDetails,
  authHeader,
  createEscrow,
  createUser,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const SUBJECT = { first_name: 'Wisdom', last_name: 'Abioye', avatar_url: 'https://cdn.example/face.jpg' }
const profileUrl = (id: string) => apiRoutes.users.get.replace(':id', id)

test('ANONYMOUS gets the abbreviation, never the surname or the face', { skip }, async () => {
  const app = getApp()
  const subject = await createUser(app, SUBJECT)

  const res = await app.inject({ method: 'GET', url: profileUrl(subject.row.id) })
  assert.strictEqual(res.statusCode, 200, res.body)

  const body = res.json<PublicUser>()
  assert.strictEqual(body.display_name, abbreviatedName(SUBJECT.first_name, SUBJECT.last_name))
  assert.strictEqual(body.full_name, null)
  assert.strictEqual(body.avatar_url, null)
  assert.ok(!res.body.includes(SUBJECT.last_name), 'the surname reached an anonymous reader')
  assert.ok(!res.body.includes(SUBJECT.avatar_url), 'the avatar reached an anonymous reader')
})

test('a SIGNED-IN stranger gets exactly what anonymous gets', { skip }, async () => {
  // The point of #180: an account is not the entitlement. A fresh wallet mints
  // one in seconds, so "signed in" was never the line it looked like.
  const app = getApp()
  const subject = await createUser(app, SUBJECT)
  const stranger = await createUser(app)

  const anon = await app.inject({ method: 'GET', url: profileUrl(subject.row.id) })
  const signedIn = await app.inject({
    method: 'GET',
    url: profileUrl(subject.row.id),
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(signedIn.statusCode, 200, signedIn.body)
  assert.deepStrictEqual(signedIn.json<PublicUser>(), anon.json<PublicUser>())
})

test('a SETTLED counterparty gets the legal name and the face', { skip }, async () => {
  const app = getApp()
  const subject = await createUser(app, SUBJECT)
  const buyer = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: subject.row.id,
    counterparty_id: buyer.row.id,
    kind: 'exchange',
    status: 'accepted',
  })
  await attachExchangeDetails(app, escrow.id)

  const res = await app.inject({
    method: 'GET',
    url: profileUrl(subject.row.id),
    headers: authHeader(buyer.token),
  })
  assert.strictEqual(res.statusCode, 200, res.body)
  const body = res.json<PublicUser>()
  assert.strictEqual(body.full_name, 'Wisdom Abioye')
  assert.strictEqual(body.avatar_url, SUBJECT.avatar_url)
  // The abbreviation rides along, so a list can keep showing it.
  assert.strictEqual(body.display_name, 'Wisdom A.')
})

/**
 * The same boundary the exchange detail draws. A pending assignee has been
 * OFFERED a trade and has not taken it; `isEscrowParty` is the settled sense,
 * so they are not yet entitled — and without this case a rule written against
 * the broader predicate would pass every other test in this file.
 */
test('a PENDING assignee is not entitled — the escrow must be SETTLED', { skip }, async () => {
  const app = getApp()
  const subject = await createUser(app, SUBJECT)
  const invitee = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: subject.row.id,
    assigned_counterparty_id: invitee.row.id,
    kind: 'exchange',
    status: 'open',
  })
  await attachExchangeDetails(app, escrow.id)

  const res = await app.inject({
    method: 'GET',
    url: profileUrl(subject.row.id),
    headers: authHeader(invitee.token),
  })
  assert.strictEqual(res.json<PublicUser>().full_name, null, 'a pending assignee read the name')
  assert.ok(!res.body.includes(SUBJECT.last_name))
})

test('you always see YOURSELF in full, with no escrow needed', { skip }, async () => {
  // A brand-new account has no escrows at all, so a rule that only consulted
  // the escrow table would blank out its owner's own profile.
  const app = getApp()
  const me = await createUser(app, SUBJECT)

  const res = await app.inject({
    method: 'GET',
    url: profileUrl(me.row.id),
    headers: authHeader(me.token),
  })
  assert.strictEqual(res.json<PublicUser>().full_name, 'Wisdom Abioye')
  assert.strictEqual(res.json<PublicUser>().avatar_url, SUBJECT.avatar_url)
})

/**
 * The coordinates are the sharpest thing this route used to publish: a home
 * location, unrounded, to anybody. They have no consumer in web or mobile
 * (measured, #180), so they are off the projection entirely rather than fuzzed.
 */
test('the public profile carries NO coordinates, for anyone', { skip }, async () => {
  const app = getApp()
  const subject = await createUser(app, SUBJECT)
  const friend = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: subject.row.id,
    counterparty_id: friend.row.id,
    kind: 'exchange',
    status: 'accepted',
  })
  await attachExchangeDetails(app, escrow.id)

  for (const headers of [undefined, authHeader(friend.token)]) {
    const res = await app.inject({ method: 'GET', url: profileUrl(subject.row.id), headers })
    assert.ok(!res.body.includes('latitude'), 'latitude is on the public profile')
    assert.ok(!res.body.includes('longitude'), 'longitude is on the public profile')
  }
})
