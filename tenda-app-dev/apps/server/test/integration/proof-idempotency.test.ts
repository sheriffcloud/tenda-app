import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrow_proofs } from '@tenda/shared/db/schema'
import type { QueueService } from '@server/plugins/queue'
import { TEST_DB_CONFIGURED, authHeader, useTestApp } from '../helpers/test-app'
import { partiedEscrow, proofUrl } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('proof retry returns one canonical row and emits one notification', { skip }, async () => {
  const app = getApp()
  let notificationCount = 0
  const enqueue: QueueService['enqueue'] = async (name) => {
    if (name === 'notifications') notificationCount += 1
    return { job_id: 'proof-idempotency' }
  }
  app.queue.enqueue = enqueue
  const { worker, escrow } = await partiedEscrow(app, 'submitted')
  const payload = { proofs: [{ url: proofUrl(worker.row.id, 9), type: 'image' }] }
  const send = () => app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token), payload,
  })

  const first = await send()
  const retry = await send()
  const stored = await app.db.select().from(escrow_proofs)
    .where(eq(escrow_proofs.escrow_id, escrow.id))

  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(retry.statusCode, 201)
  assert.strictEqual(retry.json()[0].id, first.json()[0].id)
  assert.strictEqual(stored.length, 1)
  assert.strictEqual(notificationCount, 1)
})

test('concurrent proof batches cannot exceed the escrow cap', { skip }, async () => {
  const app = getApp()
  app.queue.enqueue = async () => ({ job_id: 'proof-cap' })
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  const batch = (offset: number) => ({
    proofs: Array.from({ length: 11 }, (_, index) => ({
      url: proofUrl(worker.row.id, offset + index), type: 'image',
    })),
  })
  const send = (offset: number) => app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/proofs`,
    headers: authHeader(worker.token), payload: batch(offset),
  })
  const responses = await Promise.all([send(100), send(200)])
  assert.deepStrictEqual(responses.map((res) => res.statusCode).sort(), [201, 400])
  const stored = await app.db.select().from(escrow_proofs)
    .where(eq(escrow_proofs.escrow_id, escrow.id))
  assert.strictEqual(stored.length, 11)
})
