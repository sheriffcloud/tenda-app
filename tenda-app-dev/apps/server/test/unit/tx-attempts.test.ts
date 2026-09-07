/**
 * lib/tx-attempts — client-ping intake: idempotent insert + best-effort
 * verify-tx enqueue with the documented degradation path (queue down →
 * recorded but not enqueued, never thrown).
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { dedupKey } from '@server/core/queue/idempotency'
import {
  recordTxAttempt,
  type RecordTxAttemptDeps,
  type RecordTxAttemptInput,
  type TxAttemptRow,
} from '@server/lib/tx-attempts'
import type { JobPayload } from '@server/plugins/queue'
import { queueDouble, type CapturedJob, type QueueDouble } from '../helpers/queue-double'

/**
 * The verify-tx jobs, each with the dedup key it was enqueued under.
 *
 * Replaces a hand-rolled stub that pushed `payload as JobPayload['verify-tx']`.
 * The cast asserted the correlation this suite exists to check — that the intake
 * enqueues onto verify-tx — so an intake that started enqueuing somewhere else
 * would have been recorded here as a verify-tx job and every assertion below
 * would have kept passing. Reading through the double derives that correlation
 * instead: `payload` narrows only once `name` has been checked.
 *
 * A sibling of expire-escrows' `notificationJobsOf` rather than one shared
 * helper, for the reason recorded there and in helpers/queue-double.ts: the
 * generic `jobsOf(calls, name)` does not compile, and the type predicate that
 * would make it compile is as unsound as the cast this task removes. Comparing
 * against a LITERAL narrows for real, so the duplication buys soundness.
 *
 * Takes a call list rather than the double, matching `notificationsOf` and
 * `alertsOf` in the shared helper.
 */
function verifyTxJobsOf(calls: readonly CapturedJob[]): {
  payload: JobPayload['verify-tx']
  job_id?: string
}[] {
  return calls.flatMap((c) =>
    c.name === 'verify-tx' ? [{ payload: c.payload, job_id: c.opts?.job_id }] : [],
  )
}

function makeDeps(opts: { duplicate?: boolean; queueDown?: boolean } = {}): {
  deps: RecordTxAttemptDeps
  inserts: TxAttemptRow[]
  queue: QueueDouble
  warns: string[]
} {
  const inserts: TxAttemptRow[] = []
  const queue = queueDouble()
  const warns: string[] = []
  const deps: RecordTxAttemptDeps = {
    store: {
      async insertAttempt(row) {
        inserts.push(row)
        return !(opts.duplicate ?? false)
      },
    },
    // The double WRAPPED, not replaced: recording is the shared helper's job,
    // but the outage this suite documents is not — `queueDouble()` has no fault
    // injection and should not grow any for one caller. The throw stays here,
    // in front of a delegate that records exactly like every other suite's.
    queue: {
      async enqueue(name, payload, o) {
        if (opts.queueDown ?? false) throw new Error('BullMQ not provisioned')
        return queue.enqueue(name, payload, o)
      },
    },
    log: {
      warn(_obj, msg) {
        warns.push(msg)
      },
    },
  }
  return { deps, inserts, queue, warns }
}

function input(over: Partial<RecordTxAttemptInput> = {}): RecordTxAttemptInput {
  return {
    user_id: 'u-1',
    escrow_id: 'e-1',
    action: 'accept',
    tx_ref: 'sig-abc',
    chain_id: 'solana:devnet',
    chain_ns: 'solana',
    ...over,
  }
}

test('records the attempt and enqueues verify-tx with the canonical dedup key', async () => {
  const { deps, inserts, queue } = makeDeps()
  const r = await recordTxAttempt(deps, input())
  const calls = verifyTxJobsOf(queue.calls)

  assert.deepStrictEqual(r, { recorded: true, enqueued: true })
  assert.deepStrictEqual(inserts[0], {
    user_id: 'u-1',
    escrow_id: 'e-1',
    action: 'accept',
    tx_ref: 'sig-abc',
  })
  // The TOTAL as well as the projection: `verifyTxJobsOf` FILTERS, so alone it
  // cannot tell one verify-tx job from one verify-tx job plus a stray enqueue
  // onto a queue this suite does not read.
  assert.strictEqual(queue.calls.length, 1)
  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].payload.expected_event, 'EscrowAccepted')
  assert.strictEqual(calls[0].payload.escrow_id, 'e-1')
  assert.strictEqual(calls[0].payload.source, 'client-hint')
  assert.strictEqual(
    calls[0].job_id,
    dedupKey({ chain_ns: 'solana', tx_ref: 'sig-abc', event: 'EscrowAccepted' }),
  )
})

test('action → expected_event mapping covers settlement vocabulary', async () => {
  const { deps, queue } = makeDeps()
  await recordTxAttempt(deps, input({ action: 'claim_stalled', tx_ref: 's1' }))
  await recordTxAttempt(deps, input({ action: 'reclaim_abandoned', tx_ref: 's2' }))
  await recordTxAttempt(deps, input({ action: 'refund_expired', tx_ref: 's3' }))
  assert.deepStrictEqual(
    verifyTxJobsOf(queue.calls).map((c) => c.payload.expected_event),
    ['PaymentClaimed', 'EscrowAbandoned', 'EscrowExpired'],
  )
})

test('duplicate tx_ref → recorded:false but still enqueued (idempotent replay)', async () => {
  const { deps, queue } = makeDeps({ duplicate: true })
  const r = await recordTxAttempt(deps, input())
  assert.deepStrictEqual(r, { recorded: false, enqueued: true })
  assert.strictEqual(verifyTxJobsOf(queue.calls).length, 1)
})

test('queue down → recorded:true, enqueued:false, warning logged, no throw', async () => {
  const { deps, warns } = makeDeps({ queueDown: true })
  const r = await recordTxAttempt(deps, input())
  assert.deepStrictEqual(r, { recorded: true, enqueued: false })
  // Deliberately NOT asserting `queue.calls.length === 0` here. It reads like a
  // stronger check than `enqueued: false` and is in fact unfalsifiable: the
  // wrapper in makeDeps throws before it delegates, so nothing can reach the
  // double no matter what the intake does. It would pass forever, for a reason
  // that has nothing to do with the code under test.
  assert.strictEqual(warns.length, 1)
  assert.match(warns[0], /reconciliation/)
})

test('null escrow_id omits the hint from the verify-tx payload', async () => {
  const { deps, queue } = makeDeps()
  await recordTxAttempt(deps, input({ escrow_id: null }))
  assert.strictEqual('escrow_id' in verifyTxJobsOf(queue.calls)[0].payload, false)
})
