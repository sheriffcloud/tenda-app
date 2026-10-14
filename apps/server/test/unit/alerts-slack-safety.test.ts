/**
 * features/alerts/channels/slack — what USER TEXT cannot do to a message.
 *
 * Split from the channel contract and the copy (task #45); see
 * alerts-slack-channel.test.ts for the map of the three files.
 *
 * Two failure modes, and both are total rather than partial:
 *
 *  1. ESCAPING. A title or a reason is user-authored, and reaches Slack as
 *     markup unless something stops it — so a title can terminate the link it
 *     labels, or a name can forge a line in the headline.
 *  2. LENGTH, and Block Kit validity generally. Slack rejects the WHOLE message
 *     with `invalid_blocks` rather than the offending block, so one oversized
 *     or empty block is complete silence — the exact failure the alerts feature
 *     exists to prevent.
 *
 * The structural cases are written kind-agnostically, driven by
 * `slackAlertChannel.kinds`, so they keep guarding as kinds are added rather
 * than needing a copy per kind.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { partyRoleLabel } from '@tenda/shared'
import type { EscrowKind } from '@tenda/shared'
import type { AlertOf, AlertPartyNames } from '@server/features/alerts'
import { slackAlertMessage } from '@server/features/alerts/channels/slack/render/copy'
import { slackAlertChannel } from '@server/features/alerts/channels/slack'
import { RAISED_BY_PREFIX } from '@server/features/alerts/channels/slack/kinds/dispute-raised'
import { SLACK_TEXT_MAX } from '@server/features/alerts/slack'
import type { SlackMessage } from '@server/features/alerts/slack'
import { allText, contextTexts, sectionTexts } from '../helpers/slack-message'
import {
  ALERT_FIXTURES,
  disputeAlert,
  ENV_NO_DASHBOARD,
  ENV_WITH_DASHBOARD,
  NAMES,
  render,
} from '../helpers/slack-copy-fixtures'

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

// ---------- the reader the other assertions rest on -------------------------

// `allText` is what ~20 assertions in these suites search, and it is documented
// as including the FALLBACK text. Today every message repeats its fallback
// content in the blocks, so dropping `msg.text` from that join breaks nothing —
// a mutation proved exactly that, silently. This pins the property directly, so
// a copy change that puts something only in the push preview cannot slip past
// every `allText(...).includes(...)` in the suite.
//
// Built as a literal rather than rendered: the point is the READER's contract,
// and no current alert produces a fallback the blocks omit.
test('allText surfaces text that lives ONLY in the fallback preview', () => {
  const fallbackOnly: SlackMessage = {
    text: 'PUSH-PREVIEW-ONLY',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'in the block' } }],
  }
  assert.ok(allText(fallbackOnly).includes('PUSH-PREVIEW-ONLY'))
  assert.ok(allText(fallbackOnly).includes('in the block'))
  assert.ok(!sectionTexts(fallbackOnly).join().includes('PUSH-PREVIEW-ONLY'))
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
