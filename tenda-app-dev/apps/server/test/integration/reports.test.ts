/**
 * #98 gap-fill — POST /v1/reports (content reporting):
 *   server-resolved reported_user_id + snapshot, self-report guard,
 *   validation, 404 unknown content, idempotent re-submit.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('POST /v1/reports: 401 without a token', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'POST', url: '/v1/reports', payload: {} })
  assert.strictEqual(res.statusCode, 401)
})

test('POST /v1/reports: reporting an escrow resolves the owner and returns 201', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const reporter = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id })
  const res = await app.inject({
    method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token),
    payload: { content_type: 'escrow', content_id: escrow.id, reason: 'spam', note: 'looks fake' },
  })
  assert.strictEqual(res.statusCode, 201)
  assert.ok(res.json().id)
})

test('POST /v1/reports: rejects an invalid content_type', { skip }, async () => {
  const app = getApp()
  const reporter = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token),
    payload: { content_type: 'planet', content_id: 'x', reason: 'spam' },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('POST /v1/reports: rejects an invalid reason', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const reporter = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id })
  const res = await app.inject({
    method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token),
    payload: { content_type: 'escrow', content_id: escrow.id, reason: 'because' },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /v1/reports: 404 when the reported content does not exist', { skip }, async () => {
  const app = getApp()
  const reporter = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token),
    payload: { content_type: 'escrow', content_id: '00000000-0000-0000-0000-000000000000', reason: 'spam' },
  })
  assert.strictEqual(res.statusCode, 404)
})

test('POST /v1/reports: cannot report your own content', { skip }, async () => {
  const app = getApp()
  const owner = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: owner.row.id })
  const res = await app.inject({
    method: 'POST', url: '/v1/reports', headers: authHeader(owner.token),
    payload: { content_type: 'escrow', content_id: escrow.id, reason: 'spam' },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'CANNOT_REPORT_SELF')
})

test('POST /v1/reports: a duplicate re-submit is idempotent (200, same id)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const reporter = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id })
  const payload = { content_type: 'escrow' as const, content_id: escrow.id, reason: 'fraud' as const }
  const first = await app.inject({ method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token), payload })
  const second = await app.inject({ method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token), payload })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(second.statusCode, 200)
  assert.strictEqual(second.json().id, first.json().id)
})

test('POST /v1/reports: EVERY content type 404s on an id that does not exist (#105 T3)', { skip }, async () => {
  // The 404 above uses content_type 'escrow' and is the only one that ran. The
  // handler is a switch with one lookup per type, each with its own `if (!row)`
  // — so three of the four refusals were unexecuted while their sibling was
  // covered. Same asymmetry as the amount-window's `max` bound in #103: a case
  // reaches for one member of a family and the rest go unmeasured.
  const app = getApp()
  const reporter = await createUser(app)
  const ABSENT = '00000000-0000-0000-0000-000000000000'

  for (const content_type of ['message', 'user', 'review']) {
    const res = await app.inject({
      method: 'POST', url: '/v1/reports', headers: authHeader(reporter.token),
      payload: { content_type, content_id: ABSENT, reason: 'spam' },
    })
    assert.strictEqual(res.statusCode, 404, content_type)
    assert.match(res.json().message, /Content not found/)
  }
})
