/**
 * The dispute→alert path with NOTHING stubbed in the middle: a chain event
 * arrives at the fan-out, the producer queues, the real worker binding consumes,
 * and both channels deliver against real rows.
 *
 * Every seam here is already covered in isolation — the hook by
 * alerts-fanout.test.ts, the consumer's branches by alerts-deliver.test.ts, each
 * channel's `deliver()` by alerts-slack/alerts-in-app. What none of them can see
 * is the JOIN between the producer and the consumer, and until this file existed
 * that join had a hole in it: `buildProcessors(app).alerts` was never INVOKED by
 * any test. worker-processors.test.ts asserts only `typeof procs.alerts ===
 * 'function'` (line 491), which a binding that assembled the wrong deps would
 * satisfy exactly as well as the right one. That assembly —
 * `{ db, queue, log, env: process.env }` — is four chances to hand a channel
 * something it cannot work with, and every one of them surfaces first in a live
 * worker.
 *
 * Measured rather than asserted: with the binding replaced by `async () => {}`,
 * the entire pre-existing alerts suite stayed green at 110/110. These three
 * tests are what fail.
 *
 * So this file drives the producer's OWN output through the real processor
 * rather than through a payload it invented. A ref the producer would never
 * emit, or a processor that quietly reads a different environment, fails here
 * and nowhere else.
 *
 * What it deliberately does NOT restate: which events alert (alerts-fanout),
 * the per-channel job ids and retry budget (alerts-enqueue asserts
 * `alertJobId(ref, channel)` for both), the roster rules, the copy. Each has an
 * owner, and a second copy here would be a second place to update.
 *
 * `fetch` is stubbed per test and restored after, so no webhook is contacted.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { buildVerifyTxDeps, buildProcessors } from '@server/workers/processors'
import { slackEnvKey } from '@server/lib/slack'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import type { CapturedAlert } from '../helpers/queue-double'
import { republishEvent } from '../helpers/republish-event'
import { restoreFetch, stubFetch, stubFetchRejecting, type CapturedRequest } from '../helpers/fetch-stub'
import { TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow, attachGigDetails } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const WEBHOOK_KEY = slackEnvKey('disputes')
const WEBHOOK = 'https://hooks.slack.test/services/T/B/x'

let posted: CapturedRequest[]
let webhookBefore: string | undefined

beforeEach(() => {
  if (skip) return
  posted = stubFetch()
  // Set on process.env ITSELF, not on a deps object, and that is the point:
  // the processor threads `env: process.env` into the channels, so this is the
  // only way to make Slack live through the real binding. A processor that
  // passed `{}` — or its own copy — leaves every Slack assertion below at zero.
  webhookBefore = process.env[WEBHOOK_KEY]
  process.env[WEBHOOK_KEY] = WEBHOOK
})

afterEach(() => {
  restoreFetch()
  if (webhookBefore === undefined) delete process.env[WEBHOOK_KEY]
  else process.env[WEBHOOK_KEY] = webhookBefore
})

interface DisputedEscrow {
  escrow_id: string
  title: string
  mediator_id: string
}

/**
 * A disputed gig, its two parties, and one neutral mediator to alert.
 *
 * The mediator is created LAST and is a party to nothing, so the exclusion rule
 * cannot remove them — a fixture whose only admin was conflicted would produce
 * an empty roster and every recipient assertion below would read `0 === 0`.
 */
async function disputedEscrow(): Promise<DisputedEscrow> {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
  })
  const title = 'Re-tile the bathroom'
  await attachGigDetails(app, escrow.id, { title })
  const mediator = await createUser(app, { role: 'dispute_admin' })
  return { escrow_id: escrow.id, title, mediator_id: mediator.row.id }
}

/** The alert jobs a real DisputeRaised event produces, through the real hook. */
async function raiseDispute(escrow_id: string): Promise<SideEffectCapture> {
  const cap = installCapture(getApp())
  await buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id }))
  return cap
}

type Processors = ReturnType<typeof buildProcessors>

/**
 * Bind one processor table to a `consume(job)`, so a test builds the table ONCE
 * and reuses it for every job — the way a worker does, `buildProcessors` at
 * startup and `procs[name]` per job.
 *
 * Not a convenience. Rebuilding per job would let a binding that snapshotted
 * anything at build time (`env` is the live one) look correct, because the
 * snapshot would be re-taken between jobs and could never go stale. Building it
 * once is what makes the webhook-removal test below able to fail.
 */
const consumeWith = (procs: Processors) => (job: CapturedAlert) => procs.alerts(job.payload)

/**
 * The two queued jobs, named — asserting BOTH exist before either is used.
 *
 * Without that guard a producer that stopped queueing one channel would leave
 * the corresponding `consume(...)` unreached and the test still green, which is
 * the failure this whole file exists to notice.
 */
function channelJobs(jobs: readonly CapturedAlert[]): { slack: CapturedAlert; inApp: CapturedAlert } {
  const slack = jobs.find((job) => job.payload.channel === 'slack')
  const inApp = jobs.find((job) => job.payload.channel === 'in_app')
  assert.ok(slack !== undefined && inApp !== undefined, 'both channels must be queued')
  return { slack, inApp }
}

test('a dispute reaches Slack AND the bell, through the real worker binding', { skip }, async () => {
  const { escrow_id, title, mediator_id } = await disputedEscrow()

  const produced = await raiseDispute(escrow_id)
  const jobs = produced.alerts()
  assert.deepStrictEqual(
    jobs.map((job) => job.payload.channel),
    ['slack', 'in_app'],
    'the producer did not queue both channels — nothing below would be meaningful',
  )

  // Re-armed so the notification jobs the CONSUMER produces are separated from
  // the alert jobs the producer did. Sharing one capture would let a party
  // notice from the fan-out be mistaken for a mediator's bell row.
  const consumed = installCapture(getApp())
  const consume = consumeWith(buildProcessors(getApp()))
  for (const job of jobs) await consume(job)

  // Slack: posted through the channel the processor's own env made configured.
  assert.strictEqual(posted.length, 1, 'no webhook call — the processor did not thread process.env')
  assert.strictEqual(posted[0].url, WEBHOOK)
  assert.ok(String(posted[0].init.body).includes(title), 'the post does not describe this dispute')

  // The bell: one row for the one neutral mediator, resolved from the real DB
  // through the processor's `db`, enqueued through its `queue`.
  assert.deepStrictEqual(consumed.notifiedUserIds(), [mediator_id])
})

test('a webhook removed between enqueue and delivery is a SKIP, not a failed job', { skip }, async () => {
  // The environment is read at DELIVERY, not captured when the processors were
  // built — the case `deliverAlert` step 3 exists for, and the one the test
  // above cannot see because the webhook is set throughout it. An `env` hoisted
  // out of the binding and snapshotted once (an easy refactor to make, and one
  // that looks like a tidy-up) would post to a webhook the operator has removed.
  //
  // And it must not THROW. An unconfigured channel is a normal state, so a
  // throw here would burn all five attempts and land a real dispute in
  // removeOnFail — where the bell row is the only thing left, if it survived.
  const { escrow_id, mediator_id } = await disputedEscrow()
  const { slack, inApp } = channelJobs((await raiseDispute(escrow_id)).alerts())

  const consumed = installCapture(getApp())
  // Built while the webhook is still set, so a binding that snapshotted the
  // environment here would carry a stale, configured one into the delete below.
  const consume = consumeWith(buildProcessors(getApp()))
  delete process.env[WEBHOOK_KEY]

  await assert.doesNotReject(() => consume(slack), 'unconfigured must not burn the retry budget')
  assert.strictEqual(posted.length, 0, 'posted to a webhook that is no longer configured')

  await consume(inApp)
  assert.deepStrictEqual(consumed.notifiedUserIds(), [mediator_id], 'the bell must still ring')
})

test('a Slack outage costs the bell nothing — they are separate jobs', { skip }, async () => {
  // The reason the producer emits one job PER CHANNEL rather than one job that
  // delivers to all of them. With a shared job, Slack's throw would fail the
  // whole attempt and BullMQ would redeliver it — re-running the in-app half
  // that had already succeeded, four more times, writing the mediator's row
  // again on every retry.
  const { escrow_id, mediator_id } = await disputedEscrow()
  const { slack, inApp } = channelJobs((await raiseDispute(escrow_id)).alerts())

  const consumed = installCapture(getApp())
  const consume = consumeWith(buildProcessors(getApp()))
  stubFetchRejecting(new Error('slack unreachable'))

  // Slack THROWS, which is the retry signal — a swallow here would turn one
  // outage into permanent silence.
  await assert.rejects(() => consume(slack), /slack unreachable/)

  // And the bell is untouched by it.
  await consume(inApp)
  assert.deepStrictEqual(consumed.notifiedUserIds(), [mediator_id])
})
