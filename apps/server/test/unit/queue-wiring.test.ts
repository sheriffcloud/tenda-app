/**
 * plugins/queue wiring — URL → BullMQ connection options, queue naming.
 * The producer/consumer round-trip itself is covered by the Redis-gated
 * integration test (test/integration/bullmq.test.ts).
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { GAS_SEED_UNRESOLVED_AFTER_MS } from '@tenda/shared'
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_PREFIX,
  VERIFY_TX_JOB_OPTIONS,
  GAS_SEED_CONFIRM_JOB_OPTIONS,
  queueConnectionOptions,
  queueName,
  queueOptions,
} from '@server/plugins/queue'

test('queueConnectionOptions: host/port defaults, password, db path', () => {
  assert.deepStrictEqual(queueConnectionOptions('redis://localhost:6379'), {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
  })
  // Port defaults when omitted.
  assert.strictEqual(queueConnectionOptions('redis://redis.internal').port, 6379)
  // Password + db index (redis://:pass@host:port/2).
  const full = queueConnectionOptions('redis://:s3cret@10.0.0.5:6380/2')
  assert.deepStrictEqual(full, {
    host: '10.0.0.5',
    port: 6380,
    password: 's3cret',
    db: 2,
    maxRetriesPerRequest: null,
  })
})

test('queueName: stable tenant prefix, no colons (BullMQ forbids them)', () => {
  assert.strictEqual(queueName('verify-tx'), `${QUEUE_PREFIX}.verify-tx`)
  assert.strictEqual(queueName('notifications'), `${QUEUE_PREFIX}.notifications`)
  assert.ok(!queueName('verify-tx').includes(':'))
})

test('verify-tx failures are removable so reconciliation can reuse the job id', () => {
  const connection = { host: 'h', port: 6379, maxRetriesPerRequest: null }
  assert.strictEqual(queueOptions(connection, 'verify-tx').defaultJobOptions, VERIFY_TX_JOB_OPTIONS)
  assert.strictEqual(VERIFY_TX_JOB_OPTIONS.removeOnFail, true)
  assert.strictEqual(
    queueOptions(connection, 'notifications').defaultJobOptions,
    DEFAULT_JOB_OPTIONS,
  )

  // The gas-seed confirmation needs a budget that OUTLASTS its own give-up
  // window, or the run that would mark a grant `unresolved` never happens and
  // the row sits in `submitted` forever. Asserted against the default rather
  // than a literal, so raising the default cannot silently make this a no-op.
  const confirm = queueOptions(connection, 'gas-seed-confirm').defaultJobOptions
  assert.strictEqual(confirm, GAS_SEED_CONFIRM_JOB_OPTIONS)
  assert.ok(
    GAS_SEED_CONFIRM_JOB_OPTIONS.attempts > DEFAULT_JOB_OPTIONS.attempts,
    'confirmation must retry longer than an ordinary job',
  )
  // The exponential curve has to reach past the window, and the arithmetic is
  // easy to get wrong by one doubling — which would make this assertion pass a
  // budget that genuinely falls short.
  //
  // BullMQ waits `delay * 2^(attemptsMade - 1)` before each RETRY, and the first
  // attempt is immediate. So `attempts` attempts means `attempts - 1` waits, of
  // delay * 2^0 … 2^(attempts-2), summing to delay * (2^(attempts-1) - 1).
  // Using 2^attempts - 1 overstates the reach by a factor of two: at 14 attempts
  // it would claim 9.1h while the real schedule stops at 4.55h — short of the
  // window, so no run would ever cross it and mark a grant unresolved.
  const { attempts, backoff } = GAS_SEED_CONFIRM_JOB_OPTIONS
  const reach = backoff.delay * (2 ** (attempts - 1) - 1)
  assert.ok(
    reach > GAS_SEED_UNRESOLVED_AFTER_MS,
    `retries reach ${reach}ms but grants are given up on at ${GAS_SEED_UNRESOLVED_AFTER_MS}ms`,
  )
})
