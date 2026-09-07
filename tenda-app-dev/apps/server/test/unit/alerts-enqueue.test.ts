/**
 * features/alerts/enqueue-alert — the producer.
 *
 * Three things this file is actually pinning, none of which are "the function
 * runs":
 *
 *  1. WHICH escrow events raise an alert, asserted against the full event
 *     vocabulary rather than a hand-written list, so a new on-chain event forces
 *     a decision instead of defaulting to silence.
 *  2. The job id's SHAPE, because BullMQ rejects a malformed one at enqueue and
 *     the failure surfaces inside a guarded catch as a generic warn.
 *  3. That the producer NEVER THROWS and never lets one channel's failure cost
 *     another's job — the two properties the escrow fan-out depends on.
 *
 * A unit test: nothing here touches postgres or Redis.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import {
  ALERT_CHANNEL_NAMES,
  ALERT_JOB_ATTEMPTS,
  ALERT_KINDS,
  ALERT_REF_BY_EVENT,
  alertJobId,
  alertRefForEscrowEvent,
  channelsFor,
  enqueueAlert,
} from '@server/features/alerts'
import type { AlertChannel, AlertKind, AlertRefOf } from '@server/features/alerts'
import { DEFAULT_JOB_OPTIONS } from '@server/plugins/queue'
import { INTERNAL_EVENT_BY_WIRE } from '@server/lib/escrow-events'
import type { InternalEscrowEvent } from '@server/lib/escrow-events'
import { ESCROW_EVENTS } from '@server/chains/types'
import { slackEnvKey } from '@server/lib/slack'
import { queueDouble } from '../helpers/queue-double'
import { alertLogSpy } from '../helpers/alert-log'
import { republishEvent } from '../helpers/republish-event'

// ---------- doubles ----------------------------------------------------------------


/**
 * A channel under the test's control, handed in through the selector seam.
 * NOT added to ALERT_CHANNELS — that list stays the single source of truth.
 *
 * `deliver` is never called by the producer, so it asserts rather than
 * no-oping: a producer that somehow delivered inline would fail loudly instead
 * of passing every test here.
 */
function fakeChannel(opts: {
  name?: AlertChannel['name']
  kinds?: AlertChannel['kinds']
  configured?: boolean
  configuredThrows?: Error
}): AlertChannel {
  return {
    name: opts.name ?? 'slack',
    kinds: opts.kinds ?? ['dispute.raised'],
    configured: () => {
      if (opts.configuredThrows !== undefined) throw opts.configuredThrows
      return opts.configured ?? true
    },
    deliver: () => {
      throw new Error('the producer must not deliver')
    },
  }
}

const disputeRef: AlertRefOf<'dispute.raised'> = {
  kind: 'dispute.raised',
  escrow_id: randomUUID(),
  tx_ref: 'sig-abc123',
}

/**
 * One ref per alert kind. A `{ [K in AlertKind]: AlertRefOf<K> }` map, not an
 * array: the array version was a hand-written list of one that a new kind would
 * never join, so the test that walked it claimed to cover every kind while
 * covering exactly the one already asserted above. This shape fails to COMPILE
 * until a new kind supplies a fixture.
 */
const REF_FIXTURES: { [K in AlertKind]: AlertRefOf<K> } = {
  'dispute.raised': disputeRef,
}

// ---------- 1. which events raise an alert -------------------------------------------

test('a dispute_raised event maps to a dispute.raised ref carrying both ids', () => {
  const event = republishEvent('DisputeRaised')

  const ref = alertRefForEscrowEvent(event)

  assert.notStrictEqual(ref, null)
  assert.deepStrictEqual(ref, {
    kind: 'dispute.raised',
    escrow_id: event.escrow_id,
    tx_ref: event.tx_ref,
  })
})

test('the ref carries the EVENT ids, not defaults', () => {
  // Two distinct events must produce two distinct refs. A builder that ignored
  // its argument and returned a constant would pass a single-event assertion.
  const a = alertRefForEscrowEvent(republishEvent('DisputeRaised'))
  const b = alertRefForEscrowEvent(republishEvent('DisputeRaised'))

  assert.notStrictEqual(a, null)
  assert.notStrictEqual(b, null)
  assert.notStrictEqual(a?.escrow_id, b?.escrow_id)
  assert.notStrictEqual(a?.tx_ref, b?.tx_ref)
})

/**
 * Every escrow event that raises NO alert, with why. The list plus
 * `ALERT_REF_BY_EVENT` must together cover the whole vocabulary — the same
 * composition check the queue schedule and the fan-out use, for the same
 * reason: a new on-chain event otherwise defaults to silence and nothing says
 * so out loud.
 */
const DELIBERATELY_SILENT: Partial<Record<InternalEscrowEvent, string>> = {
  'escrow.created': 'a new gig is the happy path, not an incident',
  'escrow.accepted': 'normal progress; the parties are notified, operators need not be',
  'escrow.declined': 'the assignment was undone before any funds moved',
  'escrow.counterparty_assigned': 'normal progress',
  'escrow.assignment_released': 'the creator changed their mind inside the window',
  'escrow.proof_submitted': 'normal progress',
  'escrow.approved': 'the successful terminal state',
  'escrow.payment_claimed': 'the stalled-approval path resolving itself, by design',
  'escrow.cancelled': 'the creator cancelled before anyone accepted',
  'escrow.expired': 'nobody accepted in time; the refund path, not a failure',
  'escrow.abandoned': 'reclaimed after a no-show; the refund path',
  'escrow.dispute_resolved':
    'the mediator who resolves it is the operator who would be alerted',
}

test('every escrow event either raises an alert or is declared silent', () => {
  // Iterates ESCROW_EVENTS, the chain layer's own exhaustive list, so a new
  // on-chain event reaches this assertion the moment it is decodable — before
  // anyone remembers there is an alerts feature to consider.
  for (const wire of ESCROW_EVENTS) {
    const internal_event = INTERNAL_EVENT_BY_WIRE[wire]
    const raises = ALERT_REF_BY_EVENT[internal_event] !== undefined
    const silent = DELIBERATELY_SILENT[internal_event] !== undefined
    assert.ok(
      raises || silent,
      `${internal_event} neither raises an alert nor is declared silent — decide which`,
    )
    assert.ok(!(raises && silent), `${internal_event} is both — say which`)
  }
})

test('nothing is declared silent that is not a real escrow event', () => {
  // The inverse: a stale entry would keep excusing an event that was renamed.
  const real = new Set<string>(ESCROW_EVENTS.map((wire) => INTERNAL_EVENT_BY_WIRE[wire]))
  for (const name of Object.keys(DELIBERATELY_SILENT)) {
    assert.ok(real.has(name), `${name} is declared silent but is not an escrow event`)
  }
})

test('every declared-silent event actually resolves to null', () => {
  // The list above is a declaration of intent; this asserts the code agrees —
  // and it runs the REAL event through the mapper rather than trusting the
  // table's key, so an entry that is silent by omission rather than by
  // decision still has to prove it.
  for (const wire of ESCROW_EVENTS) {
    const internal_event = INTERNAL_EVENT_BY_WIRE[wire]
    if (DELIBERATELY_SILENT[internal_event] === undefined) continue
    assert.strictEqual(
      alertRefForEscrowEvent(republishEvent(wire)),
      null,
      `${internal_event} is declared silent but produced a ref`,
    )
  }
})

// ---------- 2. job identity ----------------------------------------------------------

test('the job id has exactly three colon-separated parts', () => {
  // A HARD BullMQ constraint, not a style choice: bullmq 5.78
  // classes/job.js `validateOptions` throws 'Custom Id cannot contain :'
  // for any custom id whose `split(':').length !== 3`. A fourth part would
  // fail at enqueue, inside the producer's catch, as a generic warn — so it
  // is pinned here where the cause is legible.
  const id = alertJobId(disputeRef, 'slack')

  assert.strictEqual(id.split(':').length, 3, id)
  assert.strictEqual(id, 'dispute.raised:sig-abc123:slack')
})

test('EVERY alert kind produces a three-part id', () => {
  // Genuinely per-kind, driven by ALERT_KINDS and the compiler-forced fixture
  // map: the ref key is chosen per kind, so a future kind keyed on something
  // containing ':' breaks the id for that kind alone — which the fixed-ref test
  // above would never see, and which the previous hand-written array here also
  // would not have, because a new kind would simply never have been added to it.
  for (const kind of ALERT_KINDS) {
    const ref = REF_FIXTURES[kind]
    assert.strictEqual(ref.kind, kind, `fixture for ${kind} has the wrong kind`)
    for (const channel of ALERT_CHANNEL_NAMES) {
      const id = alertJobId(ref, channel)
      assert.strictEqual(id.split(':').length, 3, `${kind} → ${channel}: ${id}`)
    }
  }
})

test('the id distinguishes channels — two channels get two jobs', () => {
  // Shared ids would let BullMQ's dedup swallow the second channel's job
  // entirely, which is the failure mode one-job-per-channel exists to avoid.
  assert.notStrictEqual(alertJobId(disputeRef, 'slack'), alertJobId(disputeRef, 'in_app'))
})

test('the id is stable for the same ref and channel — that IS the dedup', () => {
  const again: AlertRefOf<'dispute.raised'> = {
    kind: 'dispute.raised',
    escrow_id: randomUUID(),
    tx_ref: 'sig-abc123',
  }
  // Deliberately a DIFFERENT escrow_id with the same tx_ref: tx_ref is the
  // documented idempotency key, so the id must not vary with anything else.
  assert.strictEqual(alertJobId(disputeRef, 'slack'), alertJobId(again, 'slack'))
})

test('the id varies with the subject', () => {
  const other: AlertRefOf<'dispute.raised'> = { ...disputeRef, tx_ref: 'sig-zzz999' }
  assert.notStrictEqual(alertJobId(disputeRef, 'slack'), alertJobId(other, 'slack'))
})

// ---------- 3. the enqueue fan-out ---------------------------------------------------

test('one job per configured channel, with the dedup id and the retry budget', async () => {
  const queue = queueDouble()
  const log = alertLogSpy()
  const channels = [
    fakeChannel({ name: 'slack' }),
    fakeChannel({ name: 'in_app' }),
  ]

  await enqueueAlert(queue, disputeRef, log, () => channels)

  const jobs = queue.alerts()
  assert.strictEqual(jobs.length, 2)
  assert.deepStrictEqual(
    jobs.map((j) => j.payload.channel),
    ['slack', 'in_app'],
  )
  // The thin ref rides the queue, never a resolved alert.
  assert.deepStrictEqual(jobs[0].payload.ref, disputeRef)
  assert.strictEqual(jobs[0].opts?.job_id, alertJobId(disputeRef, 'slack'))
  assert.strictEqual(jobs[1].opts?.job_id, alertJobId(disputeRef, 'in_app'))
  for (const job of jobs) {
    assert.strictEqual(job.opts?.attempts, ALERT_JOB_ATTEMPTS)
  }
  assert.deepStrictEqual(log.warns, [])
  assert.strictEqual(log.infos.length, 1)
  assert.strictEqual(log.infos[0].obj.channels, 2)
})

test('the retry budget is lower than the queue-wide default', () => {
  // Asserted against the REAL default rather than the literal 5. The point of
  // the constant is the relationship, so a test spelling 5 would keep passing
  // after someone lowered DEFAULT_JOB_OPTIONS.attempts to 3 and turned this
  // override into a no-op — the failure it exists to catch.
  assert.ok(ALERT_JOB_ATTEMPTS > 1, 'a single attempt would not survive a dropped connection')
  assert.ok(
    ALERT_JOB_ATTEMPTS < DEFAULT_JOB_OPTIONS.attempts,
    `must be below the queue default (${DEFAULT_JOB_OPTIONS.attempts})`,
  )
})

test('an unconfigured channel is skipped without a job or a Redis round-trip', async () => {
  const queue = queueDouble()
  const log = alertLogSpy()
  const channels = [
    fakeChannel({ name: 'slack', configured: false }),
    fakeChannel({ name: 'in_app' }),
  ]

  await enqueueAlert(queue, disputeRef, log, () => channels)

  const jobs = queue.alerts()
  assert.strictEqual(jobs.length, 1, 'the unconfigured channel must enqueue nothing')
  assert.strictEqual(jobs[0].payload.channel, 'in_app')
  // Not a warning: one channel being optional is a normal deployment.
  assert.deepStrictEqual(log.warns, [])
})

test('an alert that reaches NO channel is warned — that is the incident', async () => {
  // The empty registry is today's real state (channels land later), and the
  // whole feature exists to prevent silence, so this may not pass quietly.
  const queue = queueDouble()
  const log = alertLogSpy()

  await enqueueAlert(queue, disputeRef, log, () => [])

  assert.strictEqual(queue.alerts().length, 0)
  assert.strictEqual(log.warns.length, 1)
  assert.match(log.warns[0].msg, /nobody will be told/)
  assert.strictEqual(log.warns[0].obj.registered, 0, 'registered says WHY it reached nobody')
  assert.deepStrictEqual(log.infos, [], 'no success line when nothing was enqueued')
})

test('registered channels that are all unconfigured still warn, and say so', async () => {
  // Same outcome, different cause. `registered` is what separates "nothing is
  // wired up" from "everything is wired up and switched off".
  const queue = queueDouble()
  const log = alertLogSpy()
  const channels = [fakeChannel({ name: 'slack', configured: false })]

  await enqueueAlert(queue, disputeRef, log, () => channels)

  assert.strictEqual(log.warns.length, 1)
  assert.strictEqual(log.warns[0].obj.registered, 1)
})

// ---------- 4. isolation and G5 -------------------------------------------------------

test('a channel whose configured() throws does not cost the other channel its job', async () => {
  // `configured` is contractually forbidden to throw, and a contract is not a
  // runtime guarantee. The throwing channel is FIRST so a guard placed around
  // the whole loop instead of each channel would fail this.
  const queue = queueDouble()
  const log = alertLogSpy()
  const channels = [
    fakeChannel({ name: 'slack', configuredThrows: new Error('bad env parse') }),
    fakeChannel({ name: 'in_app' }),
  ]

  await enqueueAlert(queue, disputeRef, log, () => channels)

  const jobs = queue.alerts()
  assert.strictEqual(jobs.length, 1)
  assert.strictEqual(jobs[0].payload.channel, 'in_app')
  assert.strictEqual(log.warns.length, 1)
  assert.strictEqual(log.warns[0].obj.channel, 'slack')
})

test('a failing enqueue does not cost the other channel its job', async () => {
  const log = alertLogSpy()
  const inner = queueDouble()
  let first = true
  const queue = {
    enqueue: async (
      ...args: Parameters<typeof inner.enqueue>
    ): ReturnType<typeof inner.enqueue> => {
      if (first) {
        first = false
        throw new Error('redis gone')
      }
      return inner.enqueue(...args)
    },
  }
  const channels = [fakeChannel({ name: 'slack' }), fakeChannel({ name: 'in_app' })]

  await enqueueAlert(queue, disputeRef, log, () => channels)

  assert.strictEqual(inner.alerts().length, 1)
  assert.strictEqual(inner.alerts()[0].payload.channel, 'in_app')
  assert.strictEqual(log.warns.length, 1)
  assert.match(log.warns[0].msg, /failed to enqueue/)
  assert.ok(log.warns[0].obj.err instanceof Error, 'the cause must reach the log')
})

test('a queue that always throws is survived, not propagated (G5)', async () => {
  // The no-Redis case: the queue stub 501s by design. The escrow fan-out
  // continues to the PARTIES' notices after this returns, so throwing would
  // cost them their notification because an operator alert failed.
  const log = alertLogSpy()
  const queue = {
    enqueue: () => {
      throw new Error('REDIS_URL not configured')
    },
  }
  const channels = [fakeChannel({ name: 'slack' }), fakeChannel({ name: 'in_app' })]

  await assert.doesNotReject(() => enqueueAlert(queue, disputeRef, log, () => channels))

  assert.strictEqual(log.warns.length, 3, 'one per channel, plus the reached-nobody warn')
})

test('a channel selector that throws is survived, not propagated (G5)', async () => {
  // The one thing the per-channel guards cannot cover, and the reason the outer
  // guard exists at all.
  const queue = queueDouble()
  const log = alertLogSpy()

  await assert.doesNotReject(() =>
    enqueueAlert(queue, disputeRef, log, () => {
      throw new Error('registry is malformed')
    }),
  )

  assert.strictEqual(queue.alerts().length, 0)
  assert.strictEqual(log.warns.length, 1)
  assert.match(log.warns[0].msg, /fan-out failed/)
})

test('the DEFAULT selector is the real registry', async () => {
  // Every other test here injects a selector, so none of them touches the
  // production binding at all. This one calls `enqueueAlert` with three
  // arguments, exactly as workers/escrow-fanout will.
  //
  // A CONFIGURED channel is what makes this load-bearing, and it took two goes
  // to get right. The producer skips unconfigured channels before enqueueing,
  // so with none configured "the registry is empty", "nothing is set up" and
  // "the default was silenced to `() => []`" all produce an empty queue and no
  // assertion can separate them. Registering Slack (#12) was not enough on its
  // own — its webhook still has to be set here for it to reach the queue.
  //
  // The expectation stays DERIVED from the registry rather than written down,
  // so this keeps holding as channels are added.
  const key = slackEnvKey('disputes')
  const before = process.env[key]
  process.env[key] = 'https://hooks.slack.test/services/T/B/x'
  try {
    const queue = queueDouble()
    const log = alertLogSpy()
    const expected = channelsFor(disputeRef.kind).filter((channel) => channel.configured())

    // If this ever trips, the registry changed under the line above: point it at
    // whatever env makes a currently-registered channel configured, or this test
    // silently stops testing anything.
    assert.ok(expected.length > 0, 'no configured channel — the assertion below would be vacuous')

    await enqueueAlert(queue, disputeRef, log)

    assert.deepStrictEqual(
      queue.alerts().map((job) => job.payload.channel),
      expected.map((channel) => channel.name),
    )
  } finally {
    if (before === undefined) delete process.env[key]
    else process.env[key] = before
  }
})

test('the producer never delivers inline — it only enqueues', async () => {
  // `fakeChannel.deliver` throws. Delivery belongs to the worker, where a
  // failure can be retried; doing it here would run it on the verify-tx slot
  // and make a Slack timeout the escrow pipeline's problem.
  const queue = queueDouble()
  const log = alertLogSpy()

  await enqueueAlert(queue, disputeRef, log, () => [fakeChannel({ name: 'slack' })])

  assert.strictEqual(queue.alerts().length, 1)
  assert.deepStrictEqual(log.warns, [])
})
