/**
 * The per-kind copy map — which alert kinds Slack can speak about, and how.
 *
 * Split from ./index for the same reason workers/escrow-fanout/copy.ts is split
 * from its fan-out: composing a message is pure, so the wording can be pinned by
 * a unit test with no database, no webhook and no queue. `index.ts` keeps the
 * side effects — reading env, loading names, posting. The wording itself lives
 * one file per kind under ./kinds, mirroring features/alerts/kinds/; ./blocks
 * holds what every kind composes with.
 *
 * This map is also what the channel's `kinds` is DERIVED from, so "this channel
 * accepts the kind" and "this channel has copy for the kind" are ONE fact rather
 * than two lists that can disagree. `AlertChannel.kinds` asks for exactly that:
 * "the channel is what knows whether it has copy for a kind".
 */

import type { AlertPartyNames } from '../../identities'
import { ALERT_KINDS } from '../../types'
import type { AlertKind, AlertOf } from '../../types'
import type { SlackMessage } from '@server/lib/slack'
import { disputeRaisedMessage, disputeRaisedPartyIds } from './kinds/dispute-raised'

/**
 * Everything the channel needs for one kind: whose names to load, and what to
 * say once it has them.
 *
 * Two members rather than one async builder that queries for itself. Keeping
 * the read OUT of the copy is what lets the wording be tested against a plain
 * Map, and it means the channel issues exactly one names query per alert
 * regardless of how many places the message mentions a person.
 */
interface SlackAlertCopy<K extends AlertKind> {
  /** Ids the message renders. Nulls are allowed — `loadAlertPartyNames` drops them. */
  partyIds(alert: AlertOf<K>): readonly (string | null)[]
  build(alert: AlertOf<K>, names: AlertPartyNames, env: NodeJS.ProcessEnv): SlackMessage
}

/**
 * Kinds this channel has copy for. `Partial` on purpose: a channel is an
 * explicit OPT-IN per kind (see `AlertChannel.kinds`), so a new alert kind must
 * not start paging Slack with copy nobody wrote — it reaches nobody loudly, and
 * the coverage test in test/unit/alerts-slack-copy.test.ts says which kind.
 */
const SLACK_COPY: { [K in AlertKind]?: SlackAlertCopy<K> } = {
  'dispute.raised': {
    partyIds: disputeRaisedPartyIds,
    build: disputeRaisedMessage,
  },
}

/**
 * The kinds Slack accepts, DERIVED from the copy map — never hand-listed beside
 * it. Filtered out of `ALERT_KINDS` rather than read off `Object.keys`, which
 * widens to `string[]` and would need the cast destinations.ts documents.
 *
 * While `ALERT_KINDS` has ONE member, this is observationally identical to
 * `ALERT_KINDS` itself, so no test can currently tell the derivation from a
 * hand-written list — mutation testing confirms that mutant survives. The
 * derivation is still what makes the second kind safe rather than something to
 * remember, and the "every advertised kind renders a message" test is what
 * fails the day a kind is added without copy.
 */
export const SLACK_ALERT_KINDS: readonly AlertKind[] = ALERT_KINDS.filter(
  (kind) => SLACK_COPY[kind] !== undefined,
)

/**
 * Ids whose names this alert's copy will render, or an empty list for a kind
 * Slack has no copy for.
 *
 * Generic in `K` so the map lookup and the argument are CORRELATED by the
 * compiler — the same indirection `runResolver` (../../resolve-alert) uses, and
 * it needs no cast for the same reason. Verified against a two-kind map, not
 * assumed from the single-kind case: indexed access distributes over a union
 * key, so `AlertOf<'a' | 'b'>` is a union of the two and a concrete alert is
 * assignable to it.
 */
export function slackAlertPartyIds<K extends AlertKind>(
  alert: AlertOf<K>,
): readonly (string | null)[] {
  return SLACK_COPY[alert.kind]?.partyIds(alert) ?? []
}

/**
 * The Slack message for this alert, or null when the channel has no copy for
 * its kind.
 *
 * Null rather than a throw: `deliverAlert` already refuses to hand a channel a
 * kind outside its `kinds`, so reaching here is only possible if the map and
 * the derived list disagreed — and a message nobody wrote is not something a
 * retry fixes. The caller logs and drops.
 */
export function slackAlertMessage<K extends AlertKind>(
  alert: AlertOf<K>,
  names: AlertPartyNames,
  env: NodeJS.ProcessEnv,
): SlackMessage | null {
  const copy = SLACK_COPY[alert.kind]
  return copy === undefined ? null : copy.build(alert, names, env)
}
