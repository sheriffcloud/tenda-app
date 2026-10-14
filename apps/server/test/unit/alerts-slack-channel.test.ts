/**
 * features/alerts/channels/slack — the CHANNEL's declared shape.
 *
 * Which kinds it accepts, which room each one goes to, whether it reports
 * itself configured, and which names it asks the delivery path to load. Split
 * from the copy itself (task #45), because these are questions about the
 * channel's contract with the registry, while the copy files are about what an
 * operator ends up reading:
 *
 *   this file                    — the contract: kinds, routing, configured(),
 *                                  partyIds
 *   alerts-slack-copy.test.ts    — what a dispute alert SAYS
 *   alerts-slack-safety.test.ts  — what user text cannot do to it
 *
 * WHY THE CONTRACT IS WORTH A FILE: `kinds` and the copy map have to be ONE
 * fact. A channel that advertises a kind it cannot render passes
 * `deliverAlert`'s opt-in check and then delivers nothing — a dispute that
 * looks handled and isn't. Asserting `kinds` against the full `ALERT_KINDS`
 * vocabulary rather than a list written here is what makes a new kind force a
 * decision instead of silently reaching nobody.
 *
 * `testChannelContract` is invoked HERE and nowhere else. It registers tests at
 * module load, so a second call in a sibling file would run the whole contract
 * twice and make a failure report two files.
 *
 * A unit test: the copy is pure by construction (names arrive as a Map), so
 * nothing here needs postgres, Redis or a webhook. `deliver()` itself is
 * covered in test/integration/alerts-slack.test.ts, where the name lookup is a
 * real query.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import type { AlertKind } from '@server/features/alerts'
import {
  SLACK_ALERT_KINDS,
  slackAlertDestination,
  slackAlertMessage,
  slackAlertPartyIds,
} from '@server/features/alerts/channels/slack/render/copy'
import { slackAlertChannel } from '@server/features/alerts/channels/slack'
import { slackDestinationKeys, slackEnvKey } from '@server/features/alerts/slack'
import { testChannelContract } from '../helpers/alert-channel-contract'
import {
  ALERT_FIXTURES,
  CREATOR_ID,
  disputeAlert,
  ENV_WITH_DASHBOARD,
  NAMES,
} from '../helpers/slack-copy-fixtures'

// ---------- which kinds the channel accepts -------------------------------

// The composition question a hand-written list in a test cannot answer: is
// there a kind nobody wrote Slack copy for? Silence is the failure this
// feature exists to prevent, so a new kind must be an explicit decision.
const DELIBERATELY_NOT_ON_SLACK: Partial<Record<AlertKind, string>> = {}

// The per-channel properties from the shared contract — kind coverage, the
// derived-kinds agreement, and reachability through the registry. Registry-WIDE
// facts live in test/unit/alerts-registry.test.ts.
testChannelContract({
  channel: slackAlertChannel,
  derivedKinds: SLACK_ALERT_KINDS,
  deliberatelyExcluded: DELIBERATELY_NOT_ON_SLACK,
  fixtures: ALERT_FIXTURES,
  renders: (alert) => slackAlertMessage(alert, NAMES, ENV_WITH_DASHBOARD) !== null,
})

// Beyond the contract: Slack renders blocks but uses `text` for the push
// preview, so a message that "renders" with no fallback arrives blank.
test('every advertised kind carries a non-empty fallback text', () => {
  for (const kind of slackAlertChannel.kinds) {
    const msg = slackAlertMessage(ALERT_FIXTURES[kind], NAMES, ENV_WITH_DASHBOARD)
    assert.ok(msg !== null)
    assert.ok(msg.text.trim().length > 0, `'${kind}' produced an empty fallback text`)
  }
})

// ---------- where each kind is routed --------------------------------------

const WEBHOOK = 'https://hooks.slack.test/a/b/c'
const DISPUTES_KEY = slackEnvKey('disputes')
const OPS_KEY = slackEnvKey('ops')

test('every advertised kind declares a destination that exists', () => {
  // The composition question, in the same shape as the copy-coverage check
  // above: a kind whose destination were dropped from the registry would
  // resolve to null and go quietly mute, which is the failure this channel
  // exists to prevent. `slackDestinationKeys` is the registry's own list, not a
  // copy of it, so deleting a destination fails HERE and not at 3am.
  const known = new Set<string>(slackDestinationKeys())
  for (const kind of slackAlertChannel.kinds) {
    const destination = slackAlertDestination(kind)
    assert.notStrictEqual(destination, null, `'${kind}' declares no destination`)
    assert.ok(known.has(String(destination)), `'${kind}' names an unregistered destination`)
  }
})

test('disputes and gas-seed balances go to DIFFERENT rooms', () => {
  // The point of the split, stated as the one assertion that fails if the two
  // are ever collapsed back onto one destination. They had shared a room named
  // after only one of them: a mediator cannot top up a hot wallet, and the
  // person who can should not have to read dispute context to find the notice.
  assert.strictEqual(slackAlertDestination('dispute.raised'), 'disputes')
  assert.strictEqual(slackAlertDestination('gas-seed.low-balance'), 'ops')
})

// ---------- configured() ---------------------------------------------------

test('configured: true only with a usable webhook, and never throws', () => {
  const yes = { [DISPUTES_KEY]: WEBHOOK }
  assert.strictEqual(slackAlertChannel.configured('dispute.raised', yes), true)
  assert.strictEqual(slackAlertChannel.configured('dispute.raised', {}), false)
  assert.strictEqual(slackAlertChannel.configured('dispute.raised', { [DISPUTES_KEY]: '   ' }), false)
  // Malformed must be false, not a throw: the contract says being unconfigured
  // is a normal state and this method may not raise.
  assert.strictEqual(
    slackAlertChannel.configured('dispute.raised', { [DISPUTES_KEY]: 'http://insecure' }),
    false,
  )
  assert.strictEqual(
    slackAlertChannel.configured('dispute.raised', {
      [DISPUTES_KEY]: 'https:hooks.slack.test/x',
    }),
    false,
  )
})

test('configured is answered PER KIND — one room set does not vouch for the other', () => {
  // The regression this whole change exists for. With a channel-wide answer,
  // an operator who set up only the mediation room would have every gas-seed
  // alert pass this filter and reach `deliver`, which throws on a missing
  // destination — three retries, then removeOnFail, and a draining hot wallet
  // nobody hears about.
  const disputes_only = { [DISPUTES_KEY]: WEBHOOK }
  assert.strictEqual(slackAlertChannel.configured('dispute.raised', disputes_only), true)
  assert.strictEqual(slackAlertChannel.configured('gas-seed.low-balance', disputes_only), false)

  // And the mirror image, so the test cannot pass by reading one fixed key.
  const ops_only = { [OPS_KEY]: WEBHOOK }
  assert.strictEqual(slackAlertChannel.configured('gas-seed.low-balance', ops_only), true)
  assert.strictEqual(slackAlertChannel.configured('dispute.raised', ops_only), false)

  const both = { [DISPUTES_KEY]: WEBHOOK, [OPS_KEY]: WEBHOOK }
  for (const kind of slackAlertChannel.kinds) {
    assert.strictEqual(slackAlertChannel.configured(kind, both), true, `'${kind}' with both set`)
  }
})

// ---------- which names get loaded -----------------------------------------

test('partyIds asks for exactly the ids the copy renders', () => {
  const alert = disputeAlert()
  assert.deepStrictEqual(
    [...slackAlertPartyIds(alert)],
    [alert.raised_by_id, alert.creator_id, alert.counterparty_id],
  )
})

test('partyIds passes nulls through rather than making each caller filter', () => {
  const ids = slackAlertPartyIds(disputeAlert({ raised_by_id: null, counterparty_id: null }))
  assert.deepStrictEqual([...ids], [null, CREATOR_ID, null])
})
