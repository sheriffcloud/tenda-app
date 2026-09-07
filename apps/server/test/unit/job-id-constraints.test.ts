/**
 * Every BullMQ jobId this app produces must be one BullMQ will accept.
 *
 * Three modules mint keyed job ids, none of them aware of the others:
 * `dedupKey` (core/queue/idempotency), `verifyTxDedupKey` (jobs/verify-tx) and
 * `alertJobId` (features/alerts/identity). Each documents the constraint in
 * prose, and prose drifts — src/jobs/verify-tx.ts stated it flatly wrong
 * ("BullMQ rejects a jobId containing ':'") in two places until #33. This file
 * states the rule ONCE, executably, and runs every producer through it.
 *
 * What it catches that nothing else does: the failure is invisible in CI.
 * `Job.validateOptions` runs inside `queue.add`, so an invalid id throws only
 * against a live Redis — which CI does not have — and the queue double the
 * other suites use accepts anything. A fourth component added to `dedupKey`, or
 * the ':' strip dropped from `verifyTxDedupKey`, would pass every existing test
 * and then throw in production on the first enqueue.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { dedupKey } from '@server/core/queue/idempotency'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'
import { ALERT_CHANNEL_NAMES, ALERT_KINDS, alertJobId } from '@server/features/alerts'
import type { AlertKind, AlertRefOf } from '@server/features/alerts'
import { ESCROW_EVENTS } from '@server/chains/types'
import { chainNamespaceEnum } from '@tenda/shared/db/schema/chains'

/**
 * A MIRROR of `Job.validateOptions` (bullmq 5.78, classes/job.js:1041-1050),
 * not a call into it: the real check needs a Job bound to a live queue, so
 * importing it would make this suite require Redis and it would stop running.
 *
 * Confirmed against a real queue before being written down — 0 colons accepted,
 * 1 colon REJECTED, 2 colons accepted, 3 rejected, '12345' rejected as an
 * integer, '0123' accepted (parseInt round-trips to '123', which differs).
 * The one-colon rejection is the trap: it is easy to assume ':' is either
 * allowed or banned, and it is neither.
 */
function bullMqRejects(jobId: string): string | null {
  if (`${parseInt(jobId, 10)}` === jobId) return 'Custom Id cannot be integers'
  if (jobId.includes(':') && jobId.split(':').length !== 3) return 'Custom Id cannot contain :'
  return null
}

test('the mirrored rule matches what BullMQ actually does', () => {
  // Pins the mirror itself against the measured behaviour, so a wrong
  // transcription fails here rather than silently excusing a bad producer.
  assert.strictEqual(bullMqRejects('verify-tx.solana.devnet.abc.Any'), null)
  assert.strictEqual(bullMqRejects('a:b:c'), null)
  assert.strictEqual(bullMqRejects('0123'), null)
  assert.strictEqual(bullMqRejects('a:b'), 'Custom Id cannot contain :')
  assert.strictEqual(bullMqRejects('a:b:c:d'), 'Custom Id cannot contain :')
  assert.strictEqual(bullMqRejects('12345'), 'Custom Id cannot be integers')
})

test('dedupKey produces ids BullMQ accepts, for every event kind', () => {
  // Every event, because the event is the third component: one that happened to
  // contain ':' would push the id to four parts.
  for (const event of ESCROW_EVENTS) {
    // Namespaces DERIVED, not the two that exist today: a third one added to
    // the schema enum is covered here without anyone remembering this file.
    for (const chain_ns of chainNamespaceEnum) {
      const id = dedupKey({ chain_ns, tx_ref: '5xj4nQ4abcDEF', event })
      assert.strictEqual(bullMqRejects(id), null, `${id} would be rejected`)
    }
  }
})

test('verifyTxDedupKey produces ids BullMQ accepts, including CAIP-2 chain ids', () => {
  // The CAIP-2 case is the whole reason that function strips ':' — the chain id
  // carries one of its own, and this id already has four components.
  for (const chain_id of ['solana:devnet', 'eip155:84532', 'solana:mainnet-beta']) {
    for (const event of [...ESCROW_EVENTS, 'Any' as const]) {
      const id = verifyTxDedupKey({ chain_id, tx_ref: '0xdeadbeef', event })
      assert.strictEqual(bullMqRejects(id), null, `${id} would be rejected`)
    }
  }
})

/**
 * One ref per kind, as a `Record<AlertKind, …>` so a NEW KIND fails to compile
 * here until it is covered. The same forcing function `PerKind` applies in
 * features/alerts/types/alert.ts — and it matters more than usual, because a
 * kind is exactly what adds a component to the id and #32 split the types
 * precisely because a second one is coming.
 */
const REF_BY_KIND: { [K in AlertKind]: AlertRefOf<K> } = {
  'dispute.raised': {
    kind: 'dispute.raised',
    escrow_id: 'e-1',
    // A base58 signature, the real high-entropy shape — and colon-free, which
    // is what keeps the three-part id at three parts.
    tx_ref: '5xj4nQ4abcDEF',
  },
}

test('alertJobId produces ids BullMQ accepts, for every kind x channel', () => {
  for (const kind of ALERT_KINDS) {
    for (const channel of ALERT_CHANNEL_NAMES) {
      const id = alertJobId(REF_BY_KIND[kind], channel)
      assert.strictEqual(bullMqRejects(id), null, `${id} would be rejected`)
    }
  }
})
