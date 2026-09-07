/**
 * The channel registry as a whole — the facts that are about the LIST rather
 * than about any one channel. (Per-channel properties live in
 * helpers/alert-channel-contract.ts, which each channel suite invokes.)
 *
 * Written after a real bug — `channels/in-app` imported `alertIdentity` from
 * `enqueue-alert`, which imports `registry`, which imports `channels/in-app`, a
 * runtime cycle that threw on some import orders and not others.
 *
 * BUT THIS FILE IS NOT THE GUARD AGAINST IT, and saying so matters more than
 * the reassurance would. Measured, by reintroducing the cycle and running each
 * suite: this one still PASSED, because importing the barrel alone happens to
 * resolve in a surviving order. Only test/unit/alerts-in-app-copy.test.ts
 * failed, because it imports the channel module BEFORE the barrel and that is
 * the order which blows up. A guard nobody verified is worth nothing, and this
 * one would have read as protection it does not provide.
 *
 * What these assertions are actually for is the registry as a LIST: that it is
 * whole, that no two channels claim one name, and that the declared vocabulary
 * and the live implementations agree in both directions. Each reads like a
 * triviality; each failure mode is a channel an operator can configure and
 * never hear from.
 *
 * The last test is a different kind of fact — the LAYERING inside ./types — and
 * it lives here because it shares the property that makes this file worth
 * having: nothing a behavioural test can observe would ever notice it break.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALERT_CHANNELS,
  ALERT_CHANNEL_NAMES,
  ALERT_KINDS,
  alertChannelNames,
  channelByName,
} from '@server/features/alerts'

test('every registered channel is a real, complete AlertChannel', () => {
  assert.ok(ALERT_CHANNELS.length > 0, 'an empty registry means alerts reach nobody')
  for (const [index, channel] of ALERT_CHANNELS.entries()) {
    assert.ok(
      channel !== undefined && channel !== null,
      `ALERT_CHANNELS[${index}] is empty — a half-built registry delivers nothing through that slot`,
    )
    assert.strictEqual(typeof channel.name, 'string')
    assert.strictEqual(typeof channel.configured, 'function')
    assert.strictEqual(typeof channel.deliver, 'function')
  }
})

// A channel that logs itself as one name while registered under another is
// untraceable in production — the failure mode `ALERT_CHANNELS` being an array
// rather than a keyed record is meant to make impossible, since there is only
// one spelling. This asserts no two channels chose the SAME one.
test('no two channels register under the same name', () => {
  const names = alertChannelNames()
  assert.strictEqual(new Set(names).size, names.length, `duplicate channel name in ${names.join(', ')}`)
})

test('every registered name is one ALERT_CHANNEL_NAMES declares', () => {
  for (const name of alertChannelNames()) {
    assert.ok(ALERT_CHANNEL_NAMES.includes(name), `'${name}' is registered but not declared`)
  }
})

// The inverse, and the one that catches a channel deleted but still declared:
// a name in the vocabulary that nothing implements is a channel an operator can
// configure and never hear from.
test('every declared channel name has a live implementation', () => {
  const registered = alertChannelNames()
  for (const name of ALERT_CHANNEL_NAMES) {
    assert.ok(registered.includes(name), `'${name}' is declared but no channel registers it`)
  }
})

// The consumer reads this name off a job that an EARLIER DEPLOY may have
// enqueued, naming a channel this build no longer has. A throw there would
// crash-loop the job through every attempt and bury a real alert.
test('channelByName returns null — never throws — for an unknown name', () => {
  assert.strictEqual(channelByName('no-such-channel'), null)
  assert.strictEqual(channelByName(''), null)
})

// Silence is the one outcome this feature exists to prevent, so a kind that no
// channel accepts must not be able to ship quietly.
test('every alert kind is accepted by at least one channel', () => {
  for (const kind of ALERT_KINDS) {
    const accepting = ALERT_CHANNELS.filter((channel) => channel.kinds.includes(kind))
    assert.ok(accepting.length > 0, `'${kind}' would reach nobody — no channel accepts it`)
  }
})

// ---------- types layering --------------------------------------------------

// `types/channel.ts` imports from `types/alert.ts`; the reverse must never
// happen. Today both directions are `import type` and therefore erased, so a
// cycle would be invisible: it would compile, emit no require, and pass every
// suite. It stops being invisible the moment either side needs a VALUE — and
// `ALERT_KINDS` and `ALERT_CHANNEL_NAMES` are both values, so that is one
// plausible edit away ("this kind only goes to Slack" is the obvious one).
//
// A source scan rather than a runtime probe, for the reason this file's own
// header records about the in-app cycle: a runtime check passes or fails on
// import ORDER, so it proves much less than it appears to.
test('types/alert.ts imports nothing from its own directory (the leaf of ./types)', () => {
  const dir = join(__dirname, '..', '..', 'src', 'features', 'alerts', 'types')
  const alert = readFileSync(join(dir, 'alert.ts'), 'utf8')

  // ANY sibling, not just './channel'. The first version of this checked for
  // `from './channel'` alone and was measured to pass on two real cycles: one
  // routed through `./index` (which re-exports ./channel, so it is the same
  // cycle wearing a hat) and one written with double quotes. `alert.ts` depends
  // on nothing local, so "no relative import at all" is both the simpler rule
  // and the true one.
  const relative = [...alert.matchAll(/from\s+['"](\.[^'"]*)['"]/g)].map((m) => m[1])
  assert.deepStrictEqual(
    relative,
    [],
    `types/alert.ts imports ${relative.join(', ')} from its own directory — it is the ` +
      'leaf of ./types, and anything it reaches for there closes a cycle with channel.ts',
  )

  // The guard is only meaningful while the other direction actually exists; if
  // channel.ts stopped importing ./alert there would be no cycle to prevent and
  // this test would be passing for the wrong reason.
  assert.match(
    readFileSync(join(dir, 'channel.ts'), 'utf8'),
    /from\s+['"]\.\/alert['"]/,
    'channel.ts no longer imports ./alert — re-check whether this guard still guards anything',
  )
})
