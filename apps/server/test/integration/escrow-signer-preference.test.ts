/**
 * Route wiring for the signer contract's FREE-signer declaration
 * (`signer_address` on create / accept / dispute): the declared wallet must
 * be one of the CALLER's verified linked wallets (422 ESCROW_WRONG_WALLET
 * otherwise), garbage is a 400, and a valid declaration builds. The helpers
 * are unit-tested in escrow-signer.test.ts — these tests exist because
 * dropping the route-level `assertCallerWallet`/`readSignerPreference` calls
 * would pass every unit suite while letting a stranger address through to
 * the builder.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  TEST_DB_CONFIGURED, useTestApp, createTransactableUser, createUser, createEscrow,
  authHeader, testWalletAddress,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// A syntactically fine address that belongs to NOBODY in the test DB.
const STRANGER_WALLET = 'StrangerWa11et1111111111111111111111111111'

test('POST accept: a declared signer that is not the caller’s wallet → 422 ESCROW_WRONG_WALLET', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createTransactableUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(worker.token),
    payload: { signer_address: STRANGER_WALLET },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_WALLET')
})

test('POST accept: the caller’s OWN linked wallet is accepted and builds', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createTransactableUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(worker.token),
    payload: { signer_address: testWalletAddress(worker.row.id) },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned, 'returns an unsigned tx')
})

test('POST accept: a non-string signer_address is a 400, never a silent primary fallback', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createTransactableUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(worker.token),
    payload: { signer_address: 42 },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('POST /v1/escrows: a declared signer that is not the caller’s wallet → 422, no draft row', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token),
    payload: createEscrowBody({ signer_address: STRANGER_WALLET }),
  })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_WALLET')
})

test('POST /v1/escrows: the caller’s OWN linked wallet is accepted → 201 draft + unsigned', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(creator.token),
    payload: createEscrowBody({ signer_address: testWalletAddress(creator.row.id) }),
  })
  assert.strictEqual(res.statusCode, 201)
  assert.ok(res.json().unsigned, 'returns an unsigned tx')
})

test('POST dispute: a declared signer that is not the caller’s wallet → 422 ESCROW_WRONG_WALLET', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app)
  const worker = await createTransactableUser(app)
  const e = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
    completion_deadline: new Date(Date.now() + 86_400_000),
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/dispute`, headers: authHeader(worker.token),
    payload: {
      bond_raw: '100000', reason: 'work was never delivered as agreed',
      signer_address: STRANGER_WALLET,
    },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_WALLET')
})
