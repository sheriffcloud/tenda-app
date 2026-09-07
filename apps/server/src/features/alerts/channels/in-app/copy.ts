/**
 * The per-kind copy map for the in-app channel — which alert kinds the bell can
 * speak about, and how.
 *
 * Same structure as ../slack/copy.ts, and deliberately so: two channels that
 * organise their kinds differently are two things to learn instead of one. The
 * map is what `kinds` is DERIVED from, so "this channel accepts the kind" and
 * "this channel has copy for the kind" stay ONE fact.
 *
 * A THIRD member here that Slack has no equivalent of: `excludedIds`. Slack
 * posts to a room and has no recipients to filter; this channel resolves a
 * roster of humans and must be able to leave conflicted ones out. Which people
 * are conflicted is a per-kind question — it depends on what the alert is about
 * — so it belongs beside that kind's copy, not in the channel.
 */

import type { AlertPartyNames } from '../../identities'
import { ALERT_KINDS } from '../../types'
import type { AlertKind, AlertOf } from '../../types'
import type { InAppNotice } from './notice'
import {
  disputeRaisedExcluded,
  disputeRaisedNotice,
  disputeRaisedPartyIds,
} from './kinds/dispute-raised'

/** Everything the channel needs for one kind. */
interface InAppCopy<K extends AlertKind> {
  /** Ids whose display names the body renders. Nulls allowed. */
  partyIds(alert: AlertOf<K>): readonly (string | null)[]
  /**
   * Ids to leave OUT of the recipient roster — people this alert must not page
   * even if they hold the mediator permission. Nulls allowed.
   */
  excludedIds(alert: AlertOf<K>): readonly (string | null)[]
  build(alert: AlertOf<K>, names: AlertPartyNames): InAppNotice
}

/**
 * Kinds the bell has copy for. `Partial` on purpose — a channel is an explicit
 * OPT-IN per kind, so a new alert kind must not start writing rows nobody wrote
 * wording for.
 */
const IN_APP_COPY: { [K in AlertKind]?: InAppCopy<K> } = {
  'dispute.raised': {
    partyIds: disputeRaisedPartyIds,
    excludedIds: disputeRaisedExcluded,
    build: disputeRaisedNotice,
  },
}

/**
 * The kinds this channel accepts, DERIVED from the copy map. Filtered out of
 * `ALERT_KINDS` rather than read off `Object.keys`, which widens to `string[]`.
 *
 * As in the Slack channel, this is observationally identical to `ALERT_KINDS`
 * while there is one kind, so no test can currently distinguish the derivation
 * from a hand-written list. It is what makes the second kind safe rather than
 * something to remember.
 */
export const IN_APP_ALERT_KINDS: readonly AlertKind[] = ALERT_KINDS.filter(
  (kind) => IN_APP_COPY[kind] !== undefined,
)

/**
 * Ids whose names this alert's body renders, or none for an unknown kind.
 *
 * Generic in `K` so the map lookup and the argument are correlated by the
 * compiler — the same cast-free indirection ../../resolve-alert uses.
 */
export function inAppPartyIds<K extends AlertKind>(
  alert: AlertOf<K>,
): readonly (string | null)[] {
  return IN_APP_COPY[alert.kind]?.partyIds(alert) ?? []
}

/**
 * Who must NOT be paged about this alert, or nobody for an unknown kind.
 *
 * Empty means "exclude nobody", which is also what `mediatorUserIds` requires
 * to be passed explicitly — it has no default, precisely so a caller cannot
 * forget the exclusion and silently page conflicted admins.
 */
export function inAppExcludedIds<K extends AlertKind>(
  alert: AlertOf<K>,
): readonly (string | null)[] {
  return IN_APP_COPY[alert.kind]?.excludedIds(alert) ?? []
}

/**
 * The bell copy for this alert, or null when the channel has no copy for its
 * kind. Null rather than a throw, for the reason ../slack/copy documents: a
 * message nobody wrote is not something a retry fixes.
 */
export function inAppNotice<K extends AlertKind>(
  alert: AlertOf<K>,
  names: AlertPartyNames,
): InAppNotice | null {
  const copy = IN_APP_COPY[alert.kind]
  return copy === undefined ? null : copy.build(alert, names)
}
