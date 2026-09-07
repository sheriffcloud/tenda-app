/**
 * escrowsApi — the timeout budgets, which are the part that actually bites.
 *
 * Every transition that builds a chain transaction server-side must carry the
 * RPC-aware budget: the global default aborts while the server is still
 * waiting on a slow RPC, and the symptom is a raw "Aborted" before the wallet
 * ever opens. The two table tests are the guard against a NEW transition being
 * added without one, and against an off-chain call quietly acquiring one.
 *
 * One suite since #42. It existed twice, identical apart from `vi.` vs `jest.`
 * — the same assertions, maintained in parallel, in two dialects.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from '../../../src/api/routes'
import type { CreateEscrowApiBody } from '../../../src'
import { createEscrowsApi } from '../../../src/api/client/escrows'
import {
  ESCROW_CREATE_TIMEOUT_MS,
  PROOF_PERSISTENCE_TIMEOUT_MS,
  TX_BUILD_TIMEOUT_MS,
} from '../../../src/api/client/timeouts'
import { assertLastCall, recordingRequest, type RecordedCall } from './harness'

const escrowId = { id: 'escrow-1' }

function setup() {
  const { request, calls } = recordingRequest()
  return { escrowsApi: createEscrowsApi(request), calls }
}

const optionsOf = (calls: RecordedCall[]) => calls.at(-1)?.[2]

test('initial creation uses its dedicated creation timeout', async () => {
  const { escrowsApi, calls } = setup()
  const body: CreateEscrowApiBody = {
    creation_operation_id: 'operation-1',
    kind: 'gig',
    chain_id: 'solana:devnet',
    asset: 'SOL',
    amount_raw: '1000',
    accept_window_seconds: 24 * 3600,
    completion_duration_seconds: 86_400,
  }

  await escrowsApi.create(body)

  assertLastCall(calls, 'POST', apiRoutes.escrows.create, {
    body,
    timeout: ESCROW_CREATE_TIMEOUT_MS,
  })
})

test('Approve & Pay uses the RPC-aware transaction-build timeout', async () => {
  const { escrowsApi, calls } = setup()
  await escrowsApi.approve(escrowId)

  assertLastCall(calls, 'POST', apiRoutes.escrows.approve, {
    params: escrowId,
    timeout: TX_BUILD_TIMEOUT_MS,
  })
})

const CHAIN_BUILDING: [string, (api: ReturnType<typeof createEscrowsApi>) => Promise<unknown>][] = [
  ['build create', (a) => a.buildCreate(escrowId)],
  ['accept', (a) => a.accept(escrowId)],
  ['decline', (a) => a.decline(escrowId)],
  ['assign', (a) => a.assign(escrowId, { worker_user_id: 'worker-1' })],
  ['unassign', (a) => a.unassign(escrowId)],
  ['submit', (a) => a.submit(escrowId, { proof_hash: '0xproof' })],
  ['approve', (a) => a.approve(escrowId)],
  ['claim', (a) => a.claim(escrowId)],
  ['cancel', (a) => a.cancel(escrowId)],
  ['refund', (a) => a.refund(escrowId)],
  ['dispute', (a) => a.dispute(escrowId, { bond_raw: '0', reason: 'reason' })],
  ['resolve', (a) => a.resolve(escrowId, { winner: 'creator' })],
]

for (const [name, invoke] of CHAIN_BUILDING) {
  test(`${name} cannot regress to the short global timeout`, async () => {
    const { escrowsApi, calls } = setup()
    await invoke(escrowsApi)
    assert.equal(optionsOf(calls)?.timeout, TX_BUILD_TIMEOUT_MS)
  })
}

test('off-chain assignment release does not inherit a blockchain-build timeout', async () => {
  const { escrowsApi, calls } = setup()
  await escrowsApi.release(escrowId)

  assertLastCall(calls, 'POST', apiRoutes.escrows.release, { params: escrowId })
})

test('proof persistence retains its lock-aware timeout', async () => {
  const { escrowsApi, calls } = setup()
  const body = { proofs: [] }

  await escrowsApi.addProofs(escrowId, body)

  assertLastCall(calls, 'POST', apiRoutes.escrows.addProofs, {
    params: escrowId,
    body,
    timeout: PROOF_PERSISTENCE_TIMEOUT_MS,
  })
})

const ORDINARY: [string, (api: ReturnType<typeof createEscrowsApi>) => Promise<unknown>][] = [
  ['thread', (a) => a.disputeThread(escrowId, { after: 'message-1' })],
  ['send dispute message', (a) => a.sendDisputeMessage(escrowId, { body: 'message' })],
  ['delete', (a) => a.delete(escrowId)],
  ['proof list', (a) => a.proofs(escrowId)],
  ['review', (a) => a.review(escrowId, { score: 5 })],
]

for (const [name, invoke] of ORDINARY) {
  test(`${name} remains a regular API request`, async () => {
    const { escrowsApi, calls } = setup()
    await invoke(escrowsApi)
    assert.notEqual(optionsOf(calls)?.timeout, TX_BUILD_TIMEOUT_MS)
  })
}
