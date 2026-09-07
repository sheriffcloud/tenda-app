/**
 * features/alerts/channels/slack — the copy, and the channel's declared shape.
 *
 * Four things this pins, none of which is "a message came out":
 *
 *  1. WHICH kinds Slack accepts, asserted against the full `ALERT_KINDS`
 *     vocabulary rather than a list written here, so a new kind forces a
 *     decision instead of silently reaching nobody.
 *  2. That `kinds` and the copy map are ONE fact. A channel that advertises a
 *     kind it cannot render passes `deliverAlert`'s opt-in check and then
 *     delivers nothing — a dispute that looks handled and isn't.
 *  3. Every branch of the copy that exists because the DATA is legitimately
 *     absent: no title (exchange), no dispute row yet, no dashboard URL, no
 *     reason, no known raiser. Those are the normal cases, not the edge ones.
 *  4. That user-authored text cannot break the message — escaping and the
 *     length caps, which are the two ways a title or a reason reaches Slack as
 *     something other than text.
 *
 * A unit test: the copy is pure by construction (names arrive as a Map), so
 * nothing here needs postgres, Redis or a webhook. `deliver()` itself is
 * covered in test/integration/alerts-slack.test.ts, where the name lookup is a
 * real query.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { partyRoleLabel, displayName } from '@tenda/shared'
import type { EscrowKind } from '@tenda/shared'
import type { AlertKind, AlertOf, AlertPartyNames } from '@server/features/alerts'
import {
  SLACK_ALERT_KINDS,
  slackAlertMessage,
  slackAlertPartyIds,
} from '@server/features/alerts/channels/slack/copy'
import { slackAlertChannel } from '@server/features/alerts/channels/slack'
import { RAISED_BY_PREFIX } from '@server/features/alerts/channels/slack/kinds/dispute-raised'
import { SLACK_TEXT_MAX, slackEnvKey } from '@server/lib/slack'
import type { SlackMessage } from '@server/lib/slack'
import { ADMIN_DASHBOARD_URL_ENV } from '@server/config'
import { disputeRaisedAlert } from '../helpers/alert-fixtures'
import { testChannelContract } from '../helpers/alert-channel-contract'

// ---------- fixtures -----------------------------------------------------

const CREATOR_ID = randomUUID()
const COUNTERPARTY_ID = randomUUID()
const ESCROW_ID = randomUUID()
const DASHBOARD = 'https://admin.tenda.test'

const NAMES: AlertPartyNames = new Map([
  [CREATOR_ID, 'Ada Lovelace'],
  [COUNTERPARTY_ID, 'Grace Hopper'],
])

const ENV_WITH_DASHBOARD: NodeJS.ProcessEnv = { [ADMIN_DASHBOARD_URL_ENV]: DASHBOARD }
const ENV_NO_DASHBOARD: NodeJS.ProcessEnv = {}

/**
 * The shared fixture pinned to THIS file's stable ids, so assertions can name
 * the party they expect. The shared default leaves `raised_by_id` null (the
 * case channels get wrong); here it is the creator, because most cases below
 * are about rendering a KNOWN raiser and the null one has its own tests.
 */
function disputeAlert(
  over: Partial<AlertOf<'dispute.raised'>> = {},
): AlertOf<'dispute.raised'> {
  return disputeRaisedAlert({
    escrow_id: ESCROW_ID,
    tx_ref: 'sig-abc123',
    raised_by_id: CREATOR_ID,
    creator_id: CREATOR_ID,
    counterparty_id: COUNTERPARTY_ID,
    ...over,
  })
}

/**
 * One alert per kind, keyed by kind so the COMPILER forces an entry when a
 * kind is added — a hand-written array would silently stay a list of one.
 */
const ALERT_FIXTURES: { [K in AlertKind]: AlertOf<K> } = {
  'dispute.raised': disputeAlert(),
}

// ---------- reading a message ---------------------------------------------
// `flatMap` rather than `filter().map()`: filter does not narrow a
// discriminated union, so the map would need a cast to reach `.text`.

function sectionTexts(msg: SlackMessage): string[] {
  return (msg.blocks ?? []).flatMap((b) => (b.type === 'section' ? [b.text.text] : []))
}

function contextTexts(msg: SlackMessage): string[] {
  return (msg.blocks ?? []).flatMap((b) => (b.type === 'context' ? b.elements.map((e) => e.text) : []))
}

/** Everything an operator would actually see, fallback text included. */
function allText(msg: SlackMessage): string {
  return [msg.text, ...sectionTexts(msg), ...contextTexts(msg)].join('\n')
}

/**
 * The 'Raised by …' line specifically.
 *
 * Isolated because the party labels appear TWICE in a message — once as the
 * raiser's role and once in the parties list — so `allText().includes('Worker')`
 * passes even when the raiser's role is wrong or missing. Mutation testing
 * found exactly that: two mutants that mislabelled the raiser both survived
 * assertions written against the whole message.
 */
function raisedByLine(msg: SlackMessage): string {
  const line = sectionTexts(msg)[0]
    .split('\n')
    .find((candidate) => candidate.startsWith(RAISED_BY_PREFIX))
  assert.ok(line !== undefined, `no raiser line in: ${sectionTexts(msg)[0]}`)
  return line
}

/** The message for a dispute alert, asserted present so cases read cleanly. */
function render(
  over: Partial<AlertOf<'dispute.raised'>> = {},
  env: NodeJS.ProcessEnv = ENV_WITH_DASHBOARD,
): SlackMessage {
  const msg = slackAlertMessage(disputeAlert(over), NAMES, env)
  assert.ok(msg !== null, 'dispute.raised must produce a message')
  return msg
}

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

// ---------- configured() ---------------------------------------------------

test('configured: true only with a usable webhook, and never throws', () => {
  const key = slackEnvKey('disputes')
  assert.strictEqual(slackAlertChannel.configured({ [key]: 'https://hooks.slack.test/a/b/c' }), true)
  assert.strictEqual(slackAlertChannel.configured({}), false)
  assert.strictEqual(slackAlertChannel.configured({ [key]: '   ' }), false)
  // Malformed must be false, not a throw: the contract says being unconfigured
  // is a normal state and this method may not raise.
  assert.strictEqual(slackAlertChannel.configured({ [key]: 'http://insecure' }), false)
  assert.strictEqual(slackAlertChannel.configured({ [key]: 'https:hooks.slack.test/x' }), false)
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

// ---------- dispute.raised copy --------------------------------------------

test('links the subject to the dispute in the admin dashboard', () => {
  const dispute_id = randomUUID()
  const text = allText(render({ dispute_id }))
  assert.ok(text.includes(`<${DASHBOARD}/disputes/${dispute_id}|Deliver 500 flyers>`), text)
})

// Both are documented as normal: no dispute row yet (the chain event can beat
// the POST route) and no dashboard URL configured. Neither may cost the alert.
test('renders without a link when there is no dispute row yet', () => {
  const text = allText(render({ dispute_id: null }))
  assert.ok(!text.includes('/disputes/'), 'must not invent a link')
  assert.ok(text.includes('Deliver 500 flyers'), 'the title still shows')
  assert.ok(text.includes(ESCROW_ID), 'the escrow id is what a mediator searches by')
})

test('renders without a link when the dashboard URL is unset', () => {
  const text = allText(render({}, ENV_NO_DASHBOARD))
  assert.ok(!text.includes('http'), text)
  assert.ok(text.includes('Deliver 500 flyers'))
})

// An exchange escrow has no gig_details row, so it has no title at all.
test('an untitled escrow still gets a clickable subject', () => {
  const dispute_id = randomUUID()
  const msg = render({ dispute_id, escrow_title: null, escrow_kind: 'exchange' })
  assert.ok(allText(msg).includes(`<${DASHBOARD}/disputes/${dispute_id}|`), allText(msg))
  assert.ok(msg.text.length > 0, 'the fallback text is never empty')
})

// Nothing to say and nowhere to send them: the subject line is omitted rather
// than rendered as an empty bold marker.
test('untitled AND unlinked omits the subject line instead of emitting an empty one', () => {
  const text = allText(render({ dispute_id: null, escrow_title: null }, ENV_NO_DASHBOARD))
  assert.ok(!text.includes('**'), `empty bold subject: ${JSON.stringify(text)}`)
  assert.ok(text.includes(ESCROW_ID), 'the escrow id still identifies it')
})

// `'' ?? fallback` does NOT take the fallback, so a blank column is a distinct
// case from a null one — and a row CAN exist with whitespace in it.
test('a blank title is treated as no title, not as an empty one', () => {
  for (const blank of ['', '   ', '\n\t']) {
    const text = allText(render({ escrow_title: blank, dispute_id: null }, ENV_NO_DASHBOARD))
    assert.ok(!text.includes('**'), `empty bold subject for ${JSON.stringify(blank)}: ${text}`)
    assert.ok(text.includes(ESCROW_ID), 'the escrow id still identifies it')
  }
})

test('a blank title still yields a linked subject when there is somewhere to go', () => {
  const dispute_id = randomUUID()
  const text = allText(render({ escrow_title: '  ', dispute_id }))
  assert.ok(text.includes(`<${DASHBOARD}/disputes/${dispute_id}|`), text)
  assert.ok(!text.includes('|>'), 'never an empty link label')
})

test('a blank reason emits no Reason block', () => {
  for (const blank of ['', '   ']) {
    const msg = render({ reason: blank })
    assert.strictEqual(sectionTexts(msg).length, 1, `blank ${JSON.stringify(blank)} added a block`)
    assert.ok(!allText(msg).includes('*Reason*'))
  }
})

test('the fallback text never trails an empty segment for a blank title', () => {
  const msg = render({ escrow_title: '   ' })
  assert.strictEqual(msg.text, msg.text.trim())
  assert.ok(!/·\s*$/.test(msg.text), `dangling separator: ${JSON.stringify(msg.text)}`)
})

// The fallback IS the push preview. An exchange escrow has no title, so without
// a second identifier every one of them previews as the same three words and an
// operator cannot tell two live disputes apart — precisely when the blocks are
// thinnest and the preview matters most.
test('the push preview identifies the escrow when there is no title', () => {
  for (const untitled of [null, '', '   ']) {
    const msg = render({ escrow_title: untitled })
    assert.ok(msg.text.includes(ESCROW_ID), `preview cannot be told apart: ${msg.text}`)
  }
})

test('two untitled disputes do not share a push preview', () => {
  const a = slackAlertMessage(disputeAlert({ escrow_title: null }), NAMES, ENV_WITH_DASHBOARD)
  const b = slackAlertMessage(
    disputeRaisedAlert({ escrow_title: null }),
    NAMES,
    ENV_WITH_DASHBOARD,
  )
  assert.ok(a !== null && b !== null)
  assert.notStrictEqual(a.text, b.text)
})

test('names the raiser and their party role, using the kind-aware label', () => {
  const creator = raisedByLine(render({ raised_by_id: CREATOR_ID, escrow_kind: 'gig' }))
  assert.ok(creator.includes('Ada Lovelace'), creator)
  assert.ok(creator.includes(`(${partyRoleLabel('gig', 'creator')})`), creator)
  assert.ok(!creator.includes(partyRoleLabel('gig', 'counterparty')), creator)

  const worker = raisedByLine(render({ raised_by_id: COUNTERPARTY_ID, escrow_kind: 'gig' }))
  assert.ok(worker.includes('Grace Hopper'), worker)
  assert.ok(worker.includes(`(${partyRoleLabel('gig', 'counterparty')})`), worker)
  assert.ok(!worker.includes(partyRoleLabel('gig', 'creator')), worker)
})

// The same structural role reads differently per kind — Poster/Worker vs
// Maker/Taker — and that vocabulary lives in shared, not here.
test('exchange alerts use the exchange vocabulary', () => {
  const text = allText(render({ escrow_kind: 'exchange', escrow_title: null }))
  assert.ok(text.includes(partyRoleLabel('exchange', 'creator')), text)
  assert.ok(text.includes(partyRoleLabel('exchange', 'counterparty')), text)
  assert.ok(!text.includes(partyRoleLabel('gig', 'creator')), 'no gig wording leaks in')
})

// Null raiser is real: no triage row AND an on-chain wallet that maps to no
// user. Naming nobody is right; naming a party who did not raise it is not.
test('an unknown raiser is named honestly and given no role', () => {
  const line = raisedByLine(render({ raised_by_id: null }))
  assert.ok(line.includes(displayName(null, null)), line)
  assert.ok(!line.includes('('), `a role was claimed for nobody: ${line}`)
})

// A raiser who is neither party should not be dressed up as one.
test('a raiser who matches neither party gets a name but no role', () => {
  const stranger = randomUUID()
  const line = raisedByLine(render({ raised_by_id: stranger }))
  assert.ok(line.includes(displayName(null, null, stranger)), line)
  assert.ok(!line.includes('('), `a role was invented: ${line}`)
})

test('a party missing from the names map still renders a searchable label', () => {
  const msg = slackAlertMessage(disputeAlert(), new Map(), ENV_WITH_DASHBOARD)
  assert.ok(msg !== null)
  assert.ok(allText(msg).includes(displayName(null, null, CREATOR_ID)), allText(msg))
})

test('both parties are listed with their kind-aware labels', () => {
  const text = allText(render())
  assert.ok(text.includes('Ada Lovelace') && text.includes('Grace Hopper'), text)
})

// `counterparty_id` is nullable on the alert, so an escrow disputed before
// anyone was assigned is representable. The parties line must still render —
// "Worker: Unknown" is information; a dangling label is a rendering fault.
test('a null counterparty still produces a complete parties line', () => {
  const msg = render({ counterparty_id: null, raised_by_id: CREATOR_ID })
  const parties = contextTexts(msg)[0]
  assert.ok(parties.includes(`${partyRoleLabel('gig', 'counterparty')}: `), parties)
  assert.ok(parties.includes(displayName(null, null)), parties)
  assert.ok(!/:\s*$/.test(parties), `dangling label: ${JSON.stringify(parties)}`)
})

// The caller BOLDS this text, so an empty one renders as `**`. `names.get(id) ??
// fallback` does not catch it — an empty string is not nullish.
test('a blank name in the map falls back rather than rendering empty bold', () => {
  const blankNamed: AlertPartyNames = new Map([[CREATOR_ID, '   ']])
  const msg = slackAlertMessage(disputeAlert(), blankNamed, ENV_WITH_DASHBOARD)
  assert.ok(msg !== null)
  const line = raisedByLine(msg)
  assert.ok(line.includes(displayName(null, null, CREATOR_ID)), line)
  assert.ok(!line.includes('**'), `empty bold raiser: ${line}`)
})

test('carries the reason when one was given', () => {
  assert.ok(allText(render({ reason: 'Never delivered' })).includes('Never delivered'))
})

// A "Reason" heading with nothing under it reads as data we lost, when in fact
// the raiser never gave one.
test('omits the reason block entirely when there is none', () => {
  const msg = render({ reason: null })
  assert.strictEqual(sectionTexts(msg).length, 1, 'only the headline section')
  assert.ok(!allText(msg).includes('*Reason*'))
})

test('carries the identifiers a mediator needs to find the record', () => {
  const text = allText(render({ tx_ref: 'sig-unique-999' }))
  assert.ok(text.includes(ESCROW_ID), 'escrow id')
  assert.ok(text.includes('sig-unique-999'), 'the tx that raised it')
})

// ---------- text safety ----------------------------------------------------

test('a title containing markup cannot inject Slack entities', () => {
  const text = allText(render({ escrow_title: 'Fix <http://evil|me> & <@U123>' }))
  assert.ok(!text.includes('<http://evil'), text)
  assert.ok(!text.includes('<@U123>'), text)
  assert.ok(text.includes('&lt;') && text.includes('&amp;'), text)
})

test('a reason containing markup cannot break out of its block', () => {
  const text = allText(render({ reason: 'they said <@here> & left' }))
  assert.ok(!text.includes('<@here>'), text)
})

// The label sits inside <url|label>; an unescaped `>` would end the link early
// and spill the rest of the message outside it.
test('a title cannot terminate the link it labels', () => {
  const msg = render({ escrow_title: 'a > b' })
  const section = sectionTexts(msg)[0]
  assert.ok(section.includes('&gt;'), section)
  assert.ok(section.includes(`|a &gt; b>`), section)
})

// `escapeSlackText` neutralises only `&`, `<` and `>` — Slack's own documented
// set — so a NEWLINE survives it. Profile names are user-authored, and an
// operator reads this message to decide who did what, so a name that can invent
// a line can misattribute the dispute.
test('a party name cannot forge a line in the headline', () => {
  const forger = randomUUID()
  const names: AlertPartyNames = new Map([
    [forger, `Mallory\nRaised by *${partyRoleLabel('gig', 'counterparty')} impostor*`],
  ])
  const msg = slackAlertMessage(disputeAlert({ creator_id: forger }), names, ENV_WITH_DASHBOARD)
  assert.ok(msg !== null)

  // Exactly one line may begin with 'Raised by' — the real one.
  const forged = sectionTexts(msg)[0].split('\n').filter((l) => l.startsWith(RAISED_BY_PREFIX))
  assert.strictEqual(forged.length, 1, `forged raiser line: ${sectionTexts(msg)[0]}`)
})

test('a multi-line title cannot break the headline layout', () => {
  const msg = render({ escrow_title: 'Deliver flyers\n\n*URGENT*\nRaised by *nobody*' })
  const forged = sectionTexts(msg)[0].split('\n').filter((l) => l.startsWith(RAISED_BY_PREFIX))
  assert.strictEqual(forged.length, 1, sectionTexts(msg)[0])
  assert.ok(!msg.text.includes('\n'), `the fallback preview must stay one line: ${msg.text}`)
})

test('every block stays inside Slack’s per-block limit', () => {
  const msg = render({
    escrow_title: 'T'.repeat(10_000),
    reason: 'R'.repeat(10_000),
  })
  for (const text of [...sectionTexts(msg), ...contextTexts(msg)]) {
    assert.ok([...text].length <= SLACK_TEXT_MAX, `block of ${[...text].length} code points`)
  }
})

// The readability caps count what a PERSON reads, so they are applied before
// escaping — which means escaping can still push a block over Slack's own
// limit, and the block-level cap is what stops it. `&` is the worst case: it
// expands 5x, so a reason capped at REASON_MAX ampersands lands exactly on the
// limit and the "*Reason*" heading tips it over. Not hypothetical arithmetic —
// this test fails if the block-level truncate is removed.
test('the block cap holds for text that expands under escaping', () => {
  const msg = render({ escrow_title: '&'.repeat(10_000), reason: '&'.repeat(10_000) })
  for (const text of [...sectionTexts(msg), ...contextTexts(msg)]) {
    assert.ok([...text].length <= SLACK_TEXT_MAX, `block of ${[...text].length} code points`)
  }
})

// Identifiers are NOT length-capped as fields — truncating one makes it
// unsearchable, which defeats the reason it is in the message. So the block cap
// is the only thing bounding them, and a chain that hands back an outsized ref
// must not produce a message Slack rejects with `invalid_blocks`.
test('an outsized identifier cannot blow the context block', () => {
  const msg = render({ tx_ref: 'z'.repeat(20_000) })
  for (const text of contextTexts(msg)) {
    assert.ok([...text].length <= SLACK_TEXT_MAX, `context of ${[...text].length} code points`)
  }
})

test('the fallback text is capped too — it is the push preview', () => {
  const msg = render({ escrow_title: 'T'.repeat(10_000) })
  assert.ok([...msg.text].length <= SLACK_TEXT_MAX, `${[...msg.text].length} code points`)
})

// ---------- shape ----------------------------------------------------------

// Slack renders blocks but uses `text` for the notification preview and screen
// readers, so a blocks-only message arrives blank where it matters most.
test('every message carries both blocks and a non-empty fallback text', () => {
  for (const kind of slackAlertChannel.kinds) {
    const msg = slackAlertMessage(ALERT_FIXTURES[kind], NAMES, ENV_WITH_DASHBOARD)
    assert.ok(msg !== null)
    assert.ok(msg.text.trim().length > 0, `${kind}: empty fallback`)
    assert.ok((msg.blocks ?? []).length > 0, `${kind}: no blocks`)
  }
})

/**
 * Block Kit structural validity, for EVERY advertised kind and for the sparse
 * data shapes — because Slack rejects the WHOLE message with `invalid_blocks`,
 * not just the offending block. One malformed block is total silence, which is
 * the exact failure this feature exists to prevent.
 *
 * Written kind-agnostically so it keeps guarding as #13 and later kinds land,
 * rather than needing a copy per kind.
 */
test('every message is structurally valid Block Kit', () => {
  const sparse: Partial<AlertOf<'dispute.raised'>>[] = [
    {},
    { escrow_title: null, reason: null, dispute_id: null },
    { escrow_title: '  ', reason: '  ', raised_by_id: null, counterparty_id: null },
  ]
  const messages = [
    ...slackAlertChannel.kinds.flatMap((kind) => {
      const msg = slackAlertMessage(ALERT_FIXTURES[kind], NAMES, ENV_WITH_DASHBOARD)
      return msg === null ? [] : [msg]
    }),
    ...sparse.map((over) => render(over, ENV_NO_DASHBOARD)),
  ]

  for (const msg of messages) {
    const blocks = msg.blocks ?? []
    assert.ok(blocks.length > 0, 'a message with no blocks is just the fallback')
    for (const block of blocks) {
      if (block.type === 'section') {
        assert.strictEqual(block.text.type, 'mrkdwn')
        assert.ok(block.text.text.trim().length > 0, 'an empty section renders as a gap')
        assert.ok([...block.text.text].length <= SLACK_TEXT_MAX)
      } else {
        // Slack caps a context block at 10 elements and rejects an empty one.
        assert.ok(block.elements.length > 0 && block.elements.length <= 10, 'context arity')
        for (const element of block.elements) {
          assert.strictEqual(element.type, 'mrkdwn')
          assert.ok(element.text.trim().length > 0, 'an empty context element')
          assert.ok([...element.text].length <= SLACK_TEXT_MAX)
        }
      }
    }
  }
})

test('no block is emitted with empty text', () => {
  const msg = render({ reason: null, escrow_title: null, dispute_id: null }, ENV_NO_DASHBOARD)
  for (const text of [...sectionTexts(msg), ...contextTexts(msg)]) {
    assert.ok(text.trim().length > 0, 'an empty block renders as a gap in Slack')
  }
})

// Kind-agnostic, so it keeps holding as kinds are added.
test('the escrow kind is stated verbatim rather than relabelled', () => {
  for (const escrow_kind of ['gig', 'exchange'] satisfies EscrowKind[]) {
    const text = allText(render({ escrow_kind, escrow_title: null }))
    assert.ok(text.includes(escrow_kind), `${escrow_kind} is not stated`)
  }
})
