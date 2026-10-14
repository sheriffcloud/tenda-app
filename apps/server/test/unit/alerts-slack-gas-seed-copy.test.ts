/**
 * What Slack SAYS when a gas-seed hot wallet runs low (#53b item 4).
 *
 * Its own file rather than another block in alerts-slack-copy.test.ts, which is
 * already well past the 300-line ceiling and is about the dispute copy.
 *
 * The copy is the whole product here. Everything upstream — the tick, the
 * balance read, the dedup — exists to put one sentence in front of an operator,
 * and the ways that sentence fails are all silent: a wei figure nobody converts
 * into a decision, a chain named by an id that throws on the way to being
 * pretty-printed, a "1 grants left" that reads as a bug and gets ignored.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { chainById } from '@tenda/shared'
import { slackAlertMessage } from '@server/features/alerts/channels/slack/render/copy'
import { gasSeedLowBalancePartyIds } from '@server/features/alerts/channels/slack/kinds/gas-seed-low-balance'
import type { AlertOf, AlertPartyNames } from '@server/features/alerts'
import type { SlackMessage } from '@server/features/alerts/slack'
import { gasSeedLowBalanceAlert } from '../helpers/alert-fixtures'
import { allText, sectionTexts } from '../helpers/slack-message'

/** No people are involved in this alert, so the roster map is genuinely empty. */
const NO_NAMES: AlertPartyNames = new Map()
const ENV: NodeJS.ProcessEnv = {}

const CHAIN = 'eip155:16602'
const GRANT = '10000000000000000'

function render(over: Partial<AlertOf<'gas-seed.low-balance'>> = {}): SlackMessage {
  const msg = slackAlertMessage(
    gasSeedLowBalanceAlert({ chain_id: CHAIN, grant_raw: GRANT, ...over }),
    NO_NAMES,
    ENV,
  )
  assert.ok(msg !== null, 'gas-seed.low-balance must produce a message')
  return msg
}

// ---------- the sentence an operator acts on --------------------------------

test('the headline leads with the COUNT of grants left, not a wei figure', () => {
  // 20000000000000000 is not a number anyone converts into a decision under
  // time pressure. "2 grants left" is.
  const text = render({ grants_remaining: 2 }).text
  assert.ok(text.includes('2 grant'), text)
})

test('a wallet that can no longer pay ANYONE says stopped, not low', () => {
  // The difference between "top this up soon" and "new users are being refused
  // right now" is the difference between a morning task and a page. Reporting
  // the outage as a warning is the failure mode that costs a launch day.
  const stopped = render({ grants_remaining: 0 }).text
  const low = render({ grants_remaining: 3 }).text

  assert.ok(/STOPPED/.test(stopped), stopped)
  assert.ok(!/STOPPED/.test(low), low)
  assert.notStrictEqual(stopped, low)
})

test('one grant left is singular — "1 grants left" reads as a bug and gets ignored', () => {
  const text = render({ grants_remaining: 1 }).text
  assert.ok(text.includes('1 grant left'), text)
  assert.ok(!text.includes('1 grants'), text)
})

test('the chain is named by its DISPLAY name, not its CAIP-2 id', () => {
  const text = render().text
  assert.ok(text.includes(chainById(CHAIN).displayName), text)
})

test('a chain missing from the manifest still renders, named by its id', () => {
  // A chain ROW can outlive its manifest entry — rows are seeded from the
  // manifest and nothing deletes one when an entry is dropped. `chainById`
  // throws on an unknown id, and a throw here happens inside the delivery
  // worker: the job would burn its attempts and the alert would be LOST. An
  // alert lost because its chain name could not be prettified is the exact
  // outcome this feature exists to prevent.
  const orphan = 'eip155:999999'
  const msg = slackAlertMessage(gasSeedLowBalanceAlert({ chain_id: orphan }), NO_NAMES, ENV)
  assert.ok(msg !== null)
  assert.ok(msg.text.includes(orphan), msg.text)
})

// ---------- what the person topping the wallet up needs ---------------------

test('the exact balance, the grant size and the WALLET are all present', () => {
  // The headline is for deciding; these are for acting. An operator with a
  // funding key needs to know which address to send to and how much is there.
  const funder = '0x00000000000000000000000000000000000000f1'
  const text = allText(render({ funder_address: funder, balance_raw: '12345' }))

  assert.ok(text.includes(funder), text)
  assert.ok(text.includes('12345'), text)
  assert.ok(text.includes(GRANT), text)
})

test('the REMEDY is named in the message rather than left to be looked up', () => {
  // An alert whose fix has to be researched waits until someone has time to
  // research it. Both levers are named: top up, or stop claims for this chain.
  const text = allText(render())
  assert.ok(/top up/i.test(text), text)
  assert.ok(text.includes('claims_enabled'), text)
})

// ---------- nobody to look up ------------------------------------------------

test('this kind names NO people, so the roster query is skipped entirely', () => {
  // Not a formality. `slackAlertPartyIds` feeds `loadAlertPartyNames`, which
  // runs a `users` query at delivery. A wallet has no parties, so returning
  // anything here would be asking postgres about ids that are not user ids —
  // on a job whose whole point is to be cheap and frequent.
  assert.deepStrictEqual([...gasSeedLowBalancePartyIds()], [])
})

test('the message renders with an EMPTY names map, since it asks for none', () => {
  // The consequence of the above, asserted rather than assumed: copy that
  // reached for a name would render a blank or throw, and every other test here
  // passes the same empty map so none of them would isolate it.
  const msg = render({ grants_remaining: 4 })
  assert.ok(msg.text.length > 0)
  assert.ok(!msg.text.includes('undefined'), msg.text)
})

// ---------- the fallback preview --------------------------------------------

test('the fallback text and the section say the SAME thing', () => {
  // Slack shows `text` in the notification preview and the blocks in the
  // channel. Composed twice, a copy edit to one leaves the preview announcing
  // something the message no longer says.
  const msg = render({ grants_remaining: 0 })
  assert.ok(sectionTexts(msg).some((s) => s.includes('STOPPED')), sectionTexts(msg).join('|'))
  assert.ok(msg.text.includes('STOPPED'))
})
