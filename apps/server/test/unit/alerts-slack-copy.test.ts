/**
 * features/alerts/channels/slack — what a dispute alert SAYS.
 *
 * Split from the channel contract and the safety cases (task #45); see
 * alerts-slack-channel.test.ts for the map of the three files.
 *
 * What this pins, none of which is "a message came out":
 *
 *  1. Every branch of the copy that exists because the DATA is legitimately
 *     absent: no title (exchange), no dispute row yet, no dashboard URL, no
 *     reason, no known raiser. Those are the normal cases, not the edge ones.
 *  2. That the two places a party is named — the raiser's role and the parties
 *     line — stay correct independently. `raisedByLine` exists for exactly
 *     that: assertions against the whole message let a mislabelled raiser pass.
 *  3. That the push preview can tell two untitled disputes apart, since that
 *     is all an operator sees before opening Slack.
 *
 * A unit test: the copy is pure by construction (names arrive as a Map), so
 * nothing here needs postgres, Redis or a webhook.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { partyRoleLabel, displayName } from '@tenda/shared'
import type { AlertPartyNames } from '@server/features/alerts'
import { RAISED_BY_PREFIX } from '@server/features/alerts/channels/slack/kinds/dispute-raised'
import type { SlackMessage } from '@server/features/alerts/slack'
import { slackAlertMessage } from '@server/features/alerts/channels/slack/render/copy'
import { allText, contextTexts, sectionTexts } from '../helpers/slack-message'
import { disputeRaisedAlert } from '../helpers/alert-fixtures'
import {
  COUNTERPARTY_ID,
  CREATOR_ID,
  DASHBOARD,
  disputeAlert,
  ENV_NO_DASHBOARD,
  ENV_WITH_DASHBOARD,
  ESCROW_ID,
  NAMES,
  raisedByLine,
  render,
} from '../helpers/slack-copy-fixtures'

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

// `raisedByLine` narrows to ONE LINE of the headline, and every test below that
// uses it rests on that precision. (No count here on purpose — a number in a
// comment goes stale the moment a case is added, and this one already did.)
//
// The precision is currently INVISIBLE: today's copy puts the parties on their
// own line, so returning the whole headline section passes all of them — a
// mutation proved exactly that. This pins the narrowing directly, against a
// headline that carries a second party label, so the guard keeps working if the
// copy ever puts them in one block.
test('raisedByLine returns the raiser line ALONE, not the whole headline', () => {
  const crowded: SlackMessage = {
    text: 'fallback',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Dispute raised*\n${RAISED_BY_PREFIX}Ada (Creator)\nParties: Ada (Creator), Grace (Worker)`,
        },
      },
    ],
  }
  const line = raisedByLine(crowded)
  assert.ok(line.startsWith(RAISED_BY_PREFIX), line)
  assert.ok(line.includes('Ada (Creator)'), line)
  assert.ok(!line.includes('Grace'), `the parties line leaked into the raiser line: ${line}`)
  assert.ok(!line.includes('Dispute raised'), `the headline leaked in: ${line}`)
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
