/**
 * features/alerts/channels/slack — `deliver()`, and the name lookup it makes.
 *
 * An integration test because the half that is NOT pure is a query: which rows
 * come back for a list of ids, what happens to an id with no row, and that
 * duplicate ids cost one lookup. A fake store would assert the query I wrote
 * rather than the one postgres runs — the same reason alerts-recipients.test.ts
 * is here. The wording itself is pinned without a database in
 * test/unit/alerts-slack-copy.test.ts.
 *
 * `fetch` is stubbed per test and restored after, so no webhook is contacted.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { displayName } from '@tenda/shared'
import { alertPartyName, loadAlertPartyNames } from '@server/features/alerts'
import type { AlertDeps } from '@server/features/alerts'
import { slackAlertChannel } from '@server/features/alerts/channels/slack'
import { slackEnvKey } from '@server/lib/slack'
import { AppError } from '@server/lib/errors'
import { ADMIN_DASHBOARD_URL_ENV } from '@server/config'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'
import { queueDouble } from '../helpers/queue-double'
import { restoreFetch, stubFetch, stubFetchRejecting, type CapturedRequest } from '../helpers/fetch-stub'
import { disputeRaisedAlert } from '../helpers/alert-fixtures'
import { alertLogSpy, type AlertLogSpy } from '../helpers/alert-log'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const WEBHOOK = 'https://hooks.slack.test/services/T/B/x'
const DASHBOARD = 'https://admin.tenda.test'

const CONFIGURED_ENV: NodeJS.ProcessEnv = {
  [slackEnvKey('disputes')]: WEBHOOK,
  [ADMIN_DASHBOARD_URL_ENV]: DASHBOARD,
}

// ---------- doubles --------------------------------------------------------


let posted: CapturedRequest[] = []
let log: AlertLogSpy

beforeEach(() => {
  if (skip) return
  log = alertLogSpy()
  posted = stubFetch()
})

afterEach(restoreFetch)

/** The JSON body of a captured POST — what Slack would have received. */
function postedBody(index = 0): Record<string, unknown> {
  return JSON.parse(String(posted[index].init.body))
}

function deps(env: NodeJS.ProcessEnv = CONFIGURED_ENV): AlertDeps {
  return { db: getApp().db, queue: queueDouble(), log, env }
}

/**
 * The shared fixture, used as-is: this file's assertions are about the QUERY and
 * the POST, so the ids only need to be distinct, and every override it makes is
 * a real user row created for that test.
 */
const disputeAlert = disputeRaisedAlert

/** Everything the posted message would show an operator. */
function postedText(index = 0): string {
  return JSON.stringify(postedBody(index))
}

// ---------- the name lookup ------------------------------------------------

test('loadAlertPartyNames: resolves ids to their display names', { skip }, async () => {
  const ada = await createUser(getApp(), { first_name: 'Ada', last_name: 'Lovelace' })
  const grace = await createUser(getApp(), { first_name: 'Grace', last_name: 'Hopper' })

  const names = await loadAlertPartyNames(getApp().db, [ada.row.id, grace.row.id])

  assert.strictEqual(names.get(ada.row.id), 'Ada Lovelace')
  assert.strictEqual(names.get(grace.row.id), 'Grace Hopper')
})

// The raiser is almost always one of the two parties, so the list arrives with
// duplicates — every alert takes this path.
//
// Asserts the RESULT, and cannot assert the mechanism: postgres returns one row
// for `id in (x, x, x)` whether or not the caller de-duplicated first, so this
// passes with the `new Set(...)` removed (measured, not assumed). The dedupe is
// a query-size optimisation that is invisible through this API — naming this
// test "collapses duplicate ids" claimed something it never checked.
test('loadAlertPartyNames: repeated ids yield one entry, not one per mention', { skip }, async () => {
  const ada = await createUser(getApp(), { first_name: 'Ada', last_name: 'Lovelace' })
  const names = await loadAlertPartyNames(getApp().db, [ada.row.id, ada.row.id, ada.row.id])
  assert.strictEqual(names.size, 1)
  assert.strictEqual(names.get(ada.row.id), 'Ada Lovelace')
})

// An alert whose ids are ALL null is a real case: no triage row, an on-chain
// actor that maps to no user, and an unassigned counterparty.
//
// Asserts the ANSWER, not the mechanism, and deliberately so — the early return
// in `loadAlertPartyNames` is a saved round trip, not a correctness guard, since
// drizzle compiles an empty `inArray` to `false` rather than to broken SQL
// (checked in node_modules, and this test passes with the guard removed). A test
// named "queries nothing" would have been claiming something it never measured.
test('loadAlertPartyNames: an all-null id list resolves to no names', { skip }, async () => {
  const names = await loadAlertPartyNames(getApp().db, [null, null])
  assert.strictEqual(names.size, 0)
})

test('loadAlertPartyNames: an id with no row is simply absent', { skip }, async () => {
  const names = await loadAlertPartyNames(getApp().db, [randomUUID()])
  assert.strictEqual(names.size, 0)
})

// The name columns are NOT NULL with a '' default, so a profile with no name
// set is the common case, not an exotic one.
test('loadAlertPartyNames: a nameless profile falls back to the id label', { skip }, async () => {
  const nameless = await createUser(getApp(), { first_name: '', last_name: '' })
  const names = await loadAlertPartyNames(getApp().db, [nameless.row.id])
  assert.strictEqual(names.get(nameless.row.id), displayName(null, null, nameless.row.id))
})

test('alertPartyName: falls back for a missing row and for a null id', { skip }, () => {
  const id = randomUUID()
  assert.strictEqual(alertPartyName(new Map(), id), displayName(null, null, id))
  assert.strictEqual(alertPartyName(new Map(), null), displayName(null, null))
  assert.notStrictEqual(alertPartyName(new Map(), null).trim(), '')
})

// ---------- deliver --------------------------------------------------------

test('deliver: posts the alert to the configured webhook', { skip }, async () => {
  const creator = await createUser(getApp(), { first_name: 'Ada', last_name: 'Lovelace' })
  const worker = await createUser(getApp(), { first_name: 'Grace', last_name: 'Hopper' })

  await slackAlertChannel.deliver(
    disputeAlert({
      creator_id: creator.row.id,
      counterparty_id: worker.row.id,
      raised_by_id: worker.row.id,
    }),
    deps(),
  )

  assert.strictEqual(posted.length, 1)
  assert.strictEqual(posted[0].url, WEBHOOK)
  // The names came from the DATABASE, not from the queued alert — which is the
  // whole reason they are resolved at delivery.
  assert.ok(postedText().includes('Grace Hopper'), postedText())
  assert.ok(postedText().includes('Ada Lovelace'), postedText())
})

test('deliver: logs one line per delivery, naming the channel and kind', { skip }, async () => {
  await slackAlertChannel.deliver(disputeAlert(), deps())
  assert.strictEqual(log.infos.length, 1)
  assert.strictEqual(log.infos[0].obj.channel, slackAlertChannel.name)
  assert.strictEqual(log.infos[0].obj.kind, 'dispute.raised')
})

// A party deleted between the chain event and this job must not cost the alert:
// the mediator still needs to hear about the dispute.
test('deliver: still posts when a party row no longer exists', { skip }, async () => {
  const gone = randomUUID()
  await slackAlertChannel.deliver(disputeAlert({ creator_id: gone }), deps())

  assert.strictEqual(posted.length, 1)
  assert.ok(postedText().includes(displayName(null, null, gone)), postedText())
})

test('deliver: links to the dispute in the admin dashboard', { skip }, async () => {
  const dispute_id = randomUUID()
  await slackAlertChannel.deliver(disputeAlert({ dispute_id }), deps())
  assert.ok(postedText().includes(`${DASHBOARD}/disputes/${dispute_id}`), postedText())
})

// config.ts: "null = the alert still sends, without a link".
test('deliver: sends without a link when the dashboard URL is unset', { skip }, async () => {
  await slackAlertChannel.deliver(
    disputeAlert(),
    deps({ [slackEnvKey('disputes')]: WEBHOOK }),
  )
  assert.strictEqual(posted.length, 1)
  assert.ok(!postedText().includes('/disputes/'), postedText())
})

// The retry signal. Swallowing a transient failure here turns a Slack blip into
// permanent silence, which is the one thing an alert path may not do.
test('deliver: THROWS when the webhook rejects, so BullMQ retries', { skip }, async () => {
  posted = stubFetch({ status: 500, body: 'server_error' })
  await assert.rejects(
    () => slackAlertChannel.deliver(disputeAlert(), deps()),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.strictEqual(err.statusCode, 502)
      return true
    },
  )
  assert.strictEqual(log.infos.length, 0, 'a failed post must not log a delivery')
})

test('deliver: a network failure propagates rather than being swallowed', { skip }, async () => {
  stubFetchRejecting(new Error('ECONNREFUSED'))
  await assert.rejects(() => slackAlertChannel.deliver(disputeAlert(), deps()), /ECONNREFUSED/)
})

// `deliver` MAY ASSUME configured(). Reaching it unconfigured means the
// consumer's filter is broken — a wiring bug, not a missing webhook — and a
// silent return would make those two indistinguishable and invisible.
test('deliver: throws when the destination is not configured', { skip }, async () => {
  await assert.rejects(
    () => slackAlertChannel.deliver(disputeAlert(), deps({})),
    (err: unknown) => {
      assert.ok(err instanceof AppError)
      assert.strictEqual(err.statusCode, 500)
      assert.match(err.message, /not configured/)
      return true
    },
  )
  assert.strictEqual(posted.length, 0, 'nothing may be sent')
})

// configured() and deliver() must read ONE env, or the channel can pass its own
// check against one webhook and post to another.
test('deliver: reads the same env configured() was asked about', { skip }, async () => {
  const env: NodeJS.ProcessEnv = { [slackEnvKey('disputes')]: WEBHOOK }
  assert.strictEqual(slackAlertChannel.configured(env), true)
  await slackAlertChannel.deliver(disputeAlert(), deps(env))
  assert.strictEqual(posted[0].url, WEBHOOK)
})

test('deliver: the posted body carries blocks and a fallback text', { skip }, async () => {
  await slackAlertChannel.deliver(disputeAlert(), deps())
  const body = postedBody()
  assert.ok(typeof body.text === 'string' && body.text.length > 0, 'fallback text')
  assert.ok(Array.isArray(body.blocks) && body.blocks.length > 0, 'blocks')
})
