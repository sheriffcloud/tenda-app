/**
 * The contract EVERY alert channel must satisfy, asserted once.
 *
 * Both channel suites had grown the same assertions — kind coverage, the
 * derived-kinds agreement, "every advertised kind renders", the subset check,
 * and reachability through the registry — differing only in which channel and
 * which copy function they named. A third channel would have made it three
 * copies of properties that are not about any channel in particular.
 *
 * Registering the tests from a helper, rather than exposing one big assertion
 * function, keeps each fact its own named test: a failure says WHICH property
 * broke and for WHICH channel, instead of pointing at a single opaque call.
 *
 * Scope: everything here is about ONE channel. Facts about the registry as a
 * LIST — no duplicate names, declared-vs-live agreement, `channelByName`
 * returning null — live in test/unit/alerts-registry.test.ts, so neither file
 * restates the other.
 *
 * The properties are chosen for what their failure costs, not for coverage:
 *
 *   - a kind that no channel accepts reaches NOBODY, and silence is the one
 *     outcome this whole feature exists to prevent;
 *   - a channel advertising a kind it cannot render passes `deliverAlert`'s
 *     opt-in check and then delivers nothing — a dispute that looks handled;
 *   - a channel that is implemented but never registered, or registered under a
 *     name `channelByName` cannot find, delivers nothing and logs nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  ALERT_KINDS,
  alertChannelNames,
  channelByName,
  channelsFor,
} from '@server/features/alerts'
import type { AlertChannel, AlertKind, AlertOf } from '@server/features/alerts'

export interface ChannelContract {
  channel: AlertChannel
  /**
   * The channel's own DERIVED kinds list — the export it builds from its copy
   * map. Passed separately from `channel.kinds` on purpose: asserting the two
   * agree is the point, and reading both from the channel would assert nothing.
   */
  derivedKinds: readonly AlertKind[]
  /**
   * Kinds this channel deliberately does not handle, and why. Together with
   * `derivedKinds` it must cover the whole vocabulary, so a new alert kind
   * forces a decision instead of defaulting to silence.
   */
  deliberatelyExcluded: Partial<Record<AlertKind, string>>
  /**
   * One alert per kind. A MAP keyed by kind, not an array: the compiler forces
   * an entry when a kind is added, where a hand-written list would quietly stay
   * a list of one and the tests below would keep passing while covering less.
   */
  fixtures: { [K in AlertKind]: AlertOf<K> }
  /** Does this channel actually produce copy for this alert? */
  renders(alert: AlertOf<AlertKind>): boolean
}

export function testChannelContract(contract: ChannelContract): void {
  const { channel, derivedKinds, deliberatelyExcluded, fixtures, renders } = contract
  const label = channel.name

  test(`${label}: every alert kind either has copy or is deliberately excluded`, () => {
    for (const kind of ALERT_KINDS) {
      const accepted = derivedKinds.includes(kind)
      const excluded = deliberatelyExcluded[kind] !== undefined
      assert.ok(
        accepted !== excluded,
        `'${kind}' must either be accepted by ${label} or listed as deliberately excluded — never both, never neither`,
      )
    }
  })

  test(`${label}: advertises exactly the kinds it has copy for`, () => {
    assert.deepStrictEqual([...channel.kinds], [...derivedKinds])
  })

  test(`${label}: every advertised kind actually renders`, () => {
    for (const kind of channel.kinds) {
      assert.ok(renders(fixtures[kind]), `'${kind}' is advertised by ${label} but renders nothing`)
    }
  })

  test(`${label}: the kinds it advertises are all declared in ALERT_KINDS`, () => {
    for (const kind of channel.kinds) assert.ok(ALERT_KINDS.includes(kind), kind)
  })

  test(`${label}: is registered and reachable by its own name`, () => {
    assert.ok(alertChannelNames().includes(channel.name))
    assert.strictEqual(channelByName(channel.name), channel)
  })

  // Deliberately NOT asserting `ALERT_CHANNEL_NAMES.includes(channel.name)`
  // here. test/unit/alerts-registry.test.ts already checks that for every
  // REGISTERED name, and the test above proves this channel is registered — so
  // a per-channel copy would restate a fact already covered and give two places
  // to update when the vocabulary changes.

  test(`${label}: is selected for every kind it accepts`, () => {
    for (const kind of channel.kinds) {
      assert.ok(
        channelsFor(kind).includes(channel),
        `${label} accepts '${kind}' but channelsFor does not select it`,
      )
    }
  })
}
