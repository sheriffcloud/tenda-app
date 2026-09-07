/**
 * Data proofs through the real routes: geotag VERIFIED against the gig's
 * declared radius at add time, structured CONFORMANCE-checked against the
 * declared fields, payload identity de-duplicated, and `proof_params`
 * round-tripping create → storage → the public detail wire.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrow_proofs } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  attachGigDetails,
  authHeader,
  createEscrow,
  createUser,
  useTestApp,
} from '../helpers/test-app'
import { gigDetailsBody, partiedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// The gig's pin (Lagos). 0.0045° of latitude ≈ 500 m.
const PIN = { latitude: 6.5244, longitude: 3.3792 }
const NEARBY = { latitude: 6.5289, longitude: 3.3792 } // ~500 m
const FAR = { latitude: 6.5344, longitude: 3.3792 } // ~1.1 km

const GIG_WITH_CHECKS = {
  ...PIN,
  proof_requirements: ['geotag', 'structured'] as ('geotag' | 'structured')[],
  proof_params: {
    geotag: { radius_m: 600 },
    structured: { fields: [{ name: 'count', kind: 'number' as const, required: true }] },
  },
}

async function gigEscrowWithChecks(app: ReturnType<typeof getApp>) {
  // partiedEscrow creates the ESCROW only — the gig satellite (and with it
  // the declared checks) is attached here.
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  await attachGigDetails(app, escrow.id, GIG_WITH_CHECKS)
  return { worker, escrow }
}

function postProofs(app: ReturnType<typeof getApp>, escrowId: string, token: string, proofs: unknown[]) {
  return app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrowId}/proofs`,
    headers: authHeader(token),
    payload: { proofs },
  })
}

test('a geotag inside the radius stores a payload row (url null)', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigEscrowWithChecks(app)
  const res = await postProofs(app, escrow.id, worker.token, [{ type: 'geotag', payload: NEARBY }])
  assert.strictEqual(res.statusCode, 201)
  const [row] = res.json()
  assert.strictEqual(row.url, null)
  assert.deepStrictEqual(row.payload, NEARBY)
  assert.strictEqual(row.type, 'geotag')
})

test('a geotag outside the radius is refused as PROOF_CHECK_FAILED', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigEscrowWithChecks(app)
  const res = await postProofs(app, escrow.id, worker.token, [{ type: 'geotag', payload: FAR }])
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'PROOF_CHECK_FAILED')
  const stored = await app.db.select().from(escrow_proofs).where(eq(escrow_proofs.escrow_id, escrow.id))
  assert.strictEqual(stored.length, 0)
})

test('an identical payload retried lands as ONE row, key order blind', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigEscrowWithChecks(app)
  const first = await postProofs(app, escrow.id, worker.token, [{ type: 'geotag', payload: NEARBY }])
  const retry = await postProofs(app, escrow.id, worker.token, [
    { type: 'geotag', payload: { longitude: NEARBY.longitude, latitude: NEARBY.latitude } },
  ])
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(retry.statusCode, 201)
  assert.strictEqual(retry.json()[0].id, first.json()[0].id)
  const stored = await app.db.select().from(escrow_proofs).where(eq(escrow_proofs.escrow_id, escrow.id))
  assert.strictEqual(stored.length, 1)
})

test('nonconformant structured values are refused; conformant ones stored', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigEscrowWithChecks(app)
  const bad = await postProofs(app, escrow.id, worker.token, [
    { type: 'structured', payload: { values: { count: 'two' } } },
  ])
  assert.strictEqual(bad.statusCode, 400)
  assert.strictEqual(bad.json().code, 'PROOF_CHECK_FAILED')
  const good = await postProofs(app, escrow.id, worker.token, [
    { type: 'structured', payload: { values: { count: 2 } } },
  ])
  assert.strictEqual(good.statusCode, 201)
  assert.deepStrictEqual(good.json()[0].payload, { values: { count: 2 } })
})

test('a volunteered data proof on a gig with no declarations is stored unchecked', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  await attachGigDetails(app, escrow.id) // default gig: no requirements, no params
  const res = await postProofs(app, escrow.id, worker.token, [
    { type: 'text', payload: { text: 'left with the receptionist' } },
  ])
  assert.strictEqual(res.statusCode, 201)
  assert.deepStrictEqual(res.json()[0].payload, { text: 'left with the receptionist' })
})

// ---------- proof_params through create → detail ---------------------------

test('proof_params round-trip POST /v1/gigs → GET /v1/gigs/:id', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id }) // draft
  const created = await app.inject({
    method: 'POST',
    url: '/v1/gigs',
    headers: authHeader(u.token),
    payload: gigDetailsBody(escrow.id, {
      latitude: PIN.latitude,
      longitude: PIN.longitude,
      proof_requirements: ['geotag'],
      proof_params: { geotag: { radius_m: 250 } },
    }),
  })
  assert.strictEqual(created.statusCode, 201)
  assert.deepStrictEqual(created.json().proof_params, { geotag: { radius_m: 250 } })

  // As the creator: the escrow is still a draft, which the public read hides.
  const detail = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${escrow.id}`,
    headers: authHeader(u.token),
  })
  assert.strictEqual(detail.statusCode, 200)
  assert.deepStrictEqual(detail.json().proof_params, { geotag: { radius_m: 250 } })
  assert.deepStrictEqual(detail.json().proof_requirements, ['geotag'])
})

test('POST /v1/gigs refuses a geotag requirement without a pin, and params without the requirement', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const noPin = await createEscrow(app, { creator_id: u.row.id })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/gigs',
    headers: authHeader(u.token),
    payload: gigDetailsBody(noPin.id, {
      proof_requirements: ['geotag'],
      proof_params: { geotag: { radius_m: 250 } },
    }),
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /latitude and longitude/)

  const unrequired = await createEscrow(app, { creator_id: u.row.id })
  const res2 = await app.inject({
    method: 'POST',
    url: '/v1/gigs',
    headers: authHeader(u.token),
    payload: gigDetailsBody(unrequired.id, { proof_params: { geotag: { radius_m: 250 } } }),
  })
  assert.strictEqual(res2.statusCode, 400)
  assert.match(res2.json().message, /only valid when geotag proof is required/)
})
