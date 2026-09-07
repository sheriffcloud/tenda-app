/**
 * features/alerts/deliver-alert — the worker body's failure posture.
 *
 * The whole point of this function is WHICH failures retry and which do not, so
 * every test here is about a branch that must NOT throw — plus the one that
 * must. Getting that backwards is silent in both directions: a throw on a dead
 * channel buries a real dispute in removeOnFail, and a swallow on a Slack 503
 * loses the alert forever.
 *
 * An integration test because step 4 resolves the alert out of postgres; the
 * earlier branches return before touching it.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { disputes } from '@tenda/shared/db/schema'
import { escrow_transactions } from '@tenda/shared/db/schema/escrow'
import { deliverAlert } from '@server/features/alerts'
import type {
  Alert,
  AlertChannel,
  AlertDeps,
  AlertJob,
  AlertRef,
} from '@server/features/alerts'
import { queueDouble } from '../helpers/queue-double'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  type TestUser,
} from '../helpers/test-app'
import { alertLogSpy, type AlertLogSpy } from '../helpers/alert-log'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- doubles --------------------------------------------------------------


interface FakeChannel extends AlertChannel {
  delivered: Alert[]
  /** Every env `configured()` was handed — a channel that ignored it would
   *  silently fall back to process.env while deliver() used deps.env. */
  configuredWith: (NodeJS.ProcessEnv | undefined)[]
  /** Every deps object `deliver()` was handed. */
  deliveredWith: AlertDeps[]
}

/**
 * A channel under the test's control. NOT added to ALERT_CHANNELS — that list
 * stays the single source of truth; this is handed to `deliverAlert` through
 * its lookup seam, the same way the fan-out tests swap `app.queue.enqueue`.
 *
 * Records its ARGUMENTS, not just that it was called. A fake that ignored them
 * would pass every test below while `deliverAlert` called `configured()` with
 * nothing — which is exactly the split the AlertDeps.env contract forbids.
 */
function fakeChannel(opts: {
  kinds?: readonly AlertJob['ref']['kind'][]
  configured?: boolean
  throws?: Error
} = {}): FakeChannel {
  const delivered: Alert[] = []
  const configuredWith: (NodeJS.ProcessEnv | undefined)[] = []
  const deliveredWith: AlertDeps[] = []
  return {
    delivered,
    configuredWith,
    deliveredWith,
    name: 'slack',
    kinds: opts.kinds ?? ['dispute.raised'],
    configured: (env) => {
      configuredWith.push(env)
      return opts.configured ?? true
    },
    deliver: async (alert, channelDeps) => {
      deliveredWith.push(channelDeps)
      if (opts.throws !== undefined) throw opts.throws
      delivered.push(alert)
    },
  }
}

let log: AlertLogSpy

beforeEach(() => {
  if (skip) return
  log = alertLogSpy()
})

/**
 * The deps a worker would hand `deliverAlert`, with any part swappable.
 *
 * The override exists because the default `queueDouble()` is unreachable to the
 * caller — a test that needs to ASSERT on the queue has to own it. Without the
 * parameter, three call sites had each spelled the whole object out by hand,
 * which is three places for `env` to quietly stop being `{}`.
 */
function deps(over: Partial<AlertDeps> = {}): AlertDeps {
  return { db: getApp().db, queue: queueDouble(), log, env: {}, ...over }
}

function jobFor(ref: AlertRef, channel: AlertJob['channel'] = 'slack'): AlertJob {
  return { ref, channel }
}

interface DisputedGig {
  ref: AlertRef
  creator: TestUser
  worker: TestUser
}

/**
 * A disputed gig whose alert will resolve to a real Alert.
 *
 * `chainActor` and `rowRaiser` default to the worker — the normal case, where
 * the transaction's attested actor and the triage row agree. They are separate
 * knobs because the resolver PREFERS the chain and falls back to the row, and
 * with both set to one person no test can tell those two apart. `null` for
 * either omits that side entirely.
 */
async function disputedGig(
  opts: {
    chainActor?: (g: { creator: TestUser; worker: TestUser }) => string | null
    rowRaiser?: (g: { creator: TestUser; worker: TestUser }) => string | null
  } = {},
): Promise<DisputedGig> {
  const app = getApp()
  const creator: TestUser = await createUser(app)
  const worker: TestUser = await createUser(app)
  const parties = { creator, worker }
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
  })
  await attachGigDetails(app, escrow.id, { title: 'Fix the roof' })
  const tx_ref = `sig-${randomUUID()}`
  const actor_id = (opts.chainActor ?? ((g) => g.worker.row.id))(parties)
  const raised_by = (opts.rowRaiser ?? ((g) => g.worker.row.id))(parties)

  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id,
    type: 'dispute',
    tx_ref,
    ...(actor_id !== null ? { actor_id } : {}),
  })
  if (raised_by !== null) {
    await app.db
      .insert(disputes)
      .values({ escrow_id: escrow.id, raised_by, reason: 'No show' })
  }
  return { ref: { kind: 'dispute.raised', escrow_id: escrow.id, tx_ref }, creator, worker }
}

// ---------- the one path that DELIVERS ---------------------------------------------

test('a configured channel that accepts the kind receives the RESOLVED alert', { skip }, async () => {
  const { ref } = await disputedGig()
  const channel = fakeChannel()

  await deliverAlert(deps(), jobFor(ref), () => channel)

  assert.strictEqual(channel.delivered.length, 1)
  const alert = channel.delivered[0]
  // The channel gets facts, not the thin ref it was queued with.
  assert.strictEqual(alert.kind, 'dispute.raised')
  assert.strictEqual(alert.escrow_id, ref.escrow_id)
  assert.strictEqual(alert.escrow_title, 'Fix the roof')
  assert.strictEqual(alert.reason, 'No show')
  assert.deepStrictEqual(log.warns, [])
})

// ---------- who the alert says raised it ----------------------------------------------
// The resolver's subtlest decision, and one no other test could see while the
// fixture set the chain actor and the triage row to the same person.

// They CAN disagree: party A posts the dispute (writing `raised_by`), their
// broadcast fails, party B raises it with a raw transaction. The row still names
// A while the contract attested B. Naming the wrong party in a dispute alert is
// worse than naming none, so the CHAIN wins.
test('the chain-attested actor wins over the disputes row', { skip }, async () => {
  const { ref, creator, worker } = await disputedGig({
    chainActor: (g) => g.worker.row.id,
    rowRaiser: (g) => g.creator.row.id,
  })
  const channel = fakeChannel()

  await deliverAlert(deps(), jobFor(ref), () => channel)

  const alert = channel.delivered[0]
  assert.strictEqual(alert.kind, 'dispute.raised')
  assert.strictEqual(alert.raised_by_id, worker.row.id, 'the contract named the worker')
  assert.notStrictEqual(alert.raised_by_id, creator.row.id, 'the stale triage row must not win')
})

// The fallback direction: the on-chain wallet maps to no known user, so the row
// is all there is. Dropping to null here would name nobody when we do know.
test('the disputes row is the fallback when the chain names no known user', { skip }, async () => {
  const { ref, creator } = await disputedGig({
    chainActor: () => null,
    rowRaiser: (g) => g.creator.row.id,
  })
  const channel = fakeChannel()

  await deliverAlert(deps(), jobFor(ref), () => channel)

  assert.strictEqual(channel.delivered[0].raised_by_id, creator.row.id)
})

// Neither source knows: an on-chain dispute with no triage row and an
// unrecognised wallet. Null is the honest answer, and the channels render it.
test('an unknown raiser resolves to null rather than to a guess', { skip }, async () => {
  const { ref } = await disputedGig({ chainActor: () => null, rowRaiser: () => null })
  const channel = fakeChannel()

  await deliverAlert(deps(), jobFor(ref), () => channel)

  assert.strictEqual(channel.delivered[0].raised_by_id, null)
})

// ---------- branches that must SKIP, never throw --------------------------------------

test('an unknown channel is skipped and warned, NOT thrown', { skip }, async () => {
  // A deploy removed the channel while its jobs were queued. Throwing would
  // burn the whole retry budget and drop a real dispute into removeOnFail.
  //
  // Simulated through the lookup rather than by naming an unknown channel in
  // the job: `AlertJob.channel` is typed as a CURRENT channel name, so an
  // unknown one is unconstructible here — which is the very asymmetry the
  // string-typed lookup exists for (see AlertJob in types.ts).
  const { ref } = await disputedGig()

  await deliverAlert(deps(), jobFor(ref), () => null)

  assert.strictEqual(log.warns.length, 1)
  assert.match(log.warns[0].msg, /does not register/)
  assert.strictEqual(log.warns[0].obj.channel, 'slack')
})

test('a channel that no longer accepts the kind is skipped', { skip }, async () => {
  // `kinds` is an explicit opt-in, so it is honoured at delivery too — the
  // producer's filter can be stale by the time the job runs.
  const { ref } = await disputedGig()
  const channel = fakeChannel({ kinds: [] })

  await deliverAlert(deps(), jobFor(ref), () => channel)

  assert.strictEqual(channel.delivered.length, 0)
  assert.match(log.warns[0].msg, /no longer accepts/)
})

test('an unconfigured channel is skipped as INFO — unconfigured is normal', { skip }, async () => {
  // Slack is optional. An operator who never set it up must not get a warning
  // per dispute, or the warnings stop meaning anything.
  const { ref } = await disputedGig()
  const channel = fakeChannel({ configured: false })

  await deliverAlert(deps(), jobFor(ref), () => channel)

  assert.strictEqual(channel.delivered.length, 0)
  assert.deepStrictEqual(log.warns, [], 'not configured is not a warning')
  assert.strictEqual(log.infos.length, 1)
  assert.match(log.infos[0].msg, /not configured/)
})

test('a vanished subject is dropped, warned, and never delivered', { skip }, async () => {
  // resolveAlert returns null. No retry recovers a deleted escrow, so the job
  // ends here rather than failing three times.
  const channel = fakeChannel()
  const ghost: AlertRef = {
    kind: 'dispute.raised',
    escrow_id: randomUUID(),
    tx_ref: `sig-${randomUUID()}`,
  }

  await deliverAlert(deps(), jobFor(ghost), () => channel)

  assert.strictEqual(channel.delivered.length, 0)
  assert.match(log.warns[0].msg, /no longer exists/)
})

// ---------- the branch that must THROW -------------------------------------------------

test('a delivery failure PROPAGATES so BullMQ retries it', { skip }, async () => {
  // The inverse of every test above. A configured channel that fails is a
  // transient outage; swallowing it here would turn one Slack 503 into
  // permanent silence about a dispute.
  const { ref } = await disputedGig()
  const boom = new Error('slack 503')
  const channel = fakeChannel({ throws: boom })

  await assert.rejects(() => deliverAlert(deps(), jobFor(ref), () => channel), /slack 503/)
})

test('the skip branches resolve in order — an unknown channel never hits the DB', { skip }, async () => {
  // Ordering is load-bearing: the cheap checks come first so a dead channel
  // costs no query. A DB that throws on ANY property access proves it was
  // never reached — a plain assertion could not tell "no rows" from "no query".
  const explodingDb = new Proxy(
    {},
    {
      get() {
        throw new Error('db must not be touched')
      },
    },
  ) as AlertDeps['db']

  await deliverAlert(
    { db: explodingDb, queue: queueDouble(), log, env: {} },
    jobFor({ kind: 'dispute.raised', escrow_id: randomUUID(), tx_ref: 'sig-x' }),
    () => null,
  )

  assert.strictEqual(log.warns.length, 1)
})

// ---------- the env contract ----------------------------------------------------------

test('configured() and deliver() are handed the SAME env instance', { skip }, async () => {
  // AlertDeps.env exists so a channel cannot report itself configured against
  // one environment and then deliver against another. `deliverAlert` is the
  // thing that threads it, so identity — not equality — is what to assert:
  // a `{ ...deps.env }` copy would pass a deepEqual and still break a channel
  // that keyed a cache on the object.
  const { ref } = await disputedGig()
  const env: NodeJS.ProcessEnv = { SLACK_WEBHOOK_DISPUTES: 'https://example.invalid/hook' }
  const channel = fakeChannel()

  await deliverAlert(deps({ env }), jobFor(ref), () => channel)

  assert.strictEqual(channel.configuredWith.length, 1)
  assert.strictEqual(channel.configuredWith[0], env, 'configured() must receive deps.env')
  assert.strictEqual(channel.deliveredWith.length, 1)
  assert.strictEqual(channel.deliveredWith[0].env, env, 'deliver() must receive the same env')
})

test('deliver() receives the deps it can actually work with', { skip }, async () => {
  // The in-app channel enqueues notification jobs and reads the DB, so a
  // hollowed-out deps object would fail only at runtime, in a worker.
  const { ref } = await disputedGig()
  const channel = fakeChannel()
  const passed = deps()

  await deliverAlert(passed, jobFor(ref), () => channel)

  const received = channel.deliveredWith[0]
  assert.strictEqual(received.db, passed.db)
  assert.strictEqual(received.queue, passed.queue)
  assert.strictEqual(received.log, passed.log)
})

// ---------- the DEFAULT lookup ---------------------------------------------
//
// Every test above injects a lookup, so not one of them touches the production
// binding — `lookup = channelByName` could be deleted and they would all still
// pass, while the worker resolved nothing and every alert went quiet.
//
// These two call `deliverAlert` with TWO arguments, exactly as the worker does,
// and they name DIFFERENT channels. That pairing is what makes them worth
// having: each one alone is satisfied by a default pinned to a single channel,
// and only together do they pin dispatch BY NAME. The outcomes are deliberately
// opposite — in_app delivers, slack skips — so no one wrong default can satisfy
// both.
//
// The remaining skip branches (unknown channel, kind no longer accepted) are
// NOT re-tested here against the real registry, and deliberately: `AlertJob`
// types `channel` as a currently-registered name and `AlertKind` has one member
// that both live channels accept, so each is unconstructible without lying
// about a value's type. They are covered above through the lookup seam, which
// is the asymmetry that seam exists for.

test('the DEFAULT lookup resolves in_app against the real registry', { skip }, async () => {
  // The positive direction, and it runs the whole way through: the in-app
  // channel is always configured, so a mediator ends up with a real job. A
  // default that resolved to null would warn 'does not register' and enqueue
  // nothing; one pinned to Slack would skip as unconfigured against `env: {}`.
  const { ref } = await disputedGig()
  const mediator = await createUser(getApp(), { role: 'dispute_admin' })
  const queue = queueDouble()

  await deliverAlert(deps({ queue }), jobFor(ref, 'in_app'))

  assert.deepStrictEqual(
    queue.notifications().map((job) => job.user_id),
    [mediator.row.id],
    'the default lookup did not reach the real in-app channel',
  )
  assert.deepStrictEqual(log.warns, [])
})

test('the DEFAULT lookup resolves slack against the real registry', { skip }, async () => {
  // Same job, different name, different outcome — which is the part a constant
  // default cannot fake. Slack is unconfigured against `env: {}`, so this must
  // end as INFO: a default returning null would WARN instead, and one returning
  // the in-app channel would enqueue the notification asserted absent below.
  const { ref } = await disputedGig()
  // A CONTROL, not spare scenery: with no mediator in the database an in-app
  // delivery would also produce zero notifications, so the assertion below
  // could not tell "slack skipped" from "the wrong channel ran and found
  // nobody". The roster has to be non-empty for the zero to mean something.
  await createUser(getApp(), { role: 'dispute_admin' })
  const queue = queueDouble()

  await deliverAlert(deps({ queue }), jobFor(ref, 'slack'))

  assert.deepStrictEqual(queue.notifications(), [], 'slack must not deliver in-app')
  assert.deepStrictEqual(log.warns, [], 'unconfigured is not a warning, and not a lookup failure')
  assert.strictEqual(log.infos.length, 1)
  assert.match(log.infos[0].msg, /not configured/)
  assert.strictEqual(log.infos[0].obj.channel, 'slack')
})
