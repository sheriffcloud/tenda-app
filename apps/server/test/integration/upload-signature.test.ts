/**
 * POST /v1/upload/signature — the scoped-upload registry end to end:
 * unscoped types sign directly; scoped types (dispute) require a scope_id and
 * authorize the caller against that resource before a signature is minted.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
} from '../helpers/test-app'
import { disputedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const URL = '/v1/upload/signature'

test('signature: unscoped avatar type signs without a scope', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(user.token),
    payload: { type: 'avatar' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().folder, 'tenda/avatars')
})

test('signature: unknown type rejected', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(user.token),
    payload: { type: 'malware' },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('signature: dispute requires scope_id', { skip }, async () => {
  const app = getApp()
  const { creator } = await disputedEscrow(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(creator.token),
    payload: { type: 'dispute' },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('signature: dispute party gets a sender-scoped folder', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await disputedEscrow(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(creator.token),
    payload: { type: 'dispute', scope_id: escrow.id },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().folder, `tenda/dispute/${escrow.id}/${creator.row.id}`)
})

test('signature: mediator holding the claim can sign dispute uploads', { skip }, async () => {
  const app = getApp()
  const { escrow, dispute_id } = await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(mediator.token),
    payload: { type: 'dispute', scope_id: escrow.id },
  })
  // Mediators have thread access regardless of claim (claim gates POSTing a
  // message, not uploading); a signature is fine.
  assert.strictEqual(res.statusCode, 200)
})

test('signature: stranger denied a dispute signature (403)', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedEscrow(app)
  const stranger = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(stranger.token),
    payload: { type: 'dispute', scope_id: escrow.id },
  })
  assert.strictEqual(res.statusCode, 403)
})

test('signature: escrow with no dispute yields 404', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'accepted' })
  const res = await app.inject({
    method: 'POST',
    url: URL,
    headers: authHeader(creator.token),
    payload: { type: 'dispute', scope_id: escrow.id },
  })
  assert.strictEqual(res.statusCode, 404)
})
