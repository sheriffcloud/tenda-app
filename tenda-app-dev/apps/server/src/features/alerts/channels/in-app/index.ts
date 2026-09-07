/**
 * The in-app alert channel — a row in the notification centre for every
 * mediator who should act on this alert.
 *
 * The counterpart of ../slack, and the reason both exist. Slack reaches someone
 * who is not in the product; this reaches someone who is, keeps a durable
 * record beside every other notice they get, and works in a deployment that has
 * no Slack at all. Neither is a fallback for the other — a dispute that only
 * ever appeared in a chat room nobody scrolled back through is as lost as one
 * that only appeared in a feed nobody opened.
 *
 * It produces NOTIFICATION JOBS rather than writing rows itself. lib/notify is
 * the single producer of those jobs by design, and going around it would mean
 * re-implementing the stable-id contract, the column clamping and the live WS
 * broadcast — three things that are already right in one place.
 */

import { enqueueNotificationToMany, stableNotificationId } from '@server/lib/notify'
import { alertIdentity } from '../../identity'
import { loadAlertPartyNames } from '../../identities'
import { mediatorUserIds } from '../../recipients'
import type { AlertChannel, AlertChannelName } from '../../types'
import { IN_APP_ALERT_KINDS, inAppExcludedIds, inAppNotice, inAppPartyIds } from './copy'

/** The registry name. Typed so it must be one `ALERT_CHANNEL_NAMES` declares. */
const NAME: AlertChannelName = 'in_app'

/**
 * Namespaces the notification id, so an alert row and any future notice about
 * the same escrow cannot collide on a hash. `stableNotificationId` separates
 * its parts with NUL, so this prefix cannot be confused with the identity that
 * follows it.
 */
const ID_NAMESPACE = 'alert'

export const inAppAlertChannel: AlertChannel = {
  name: NAME,

  kinds: IN_APP_ALERT_KINDS,

  /**
   * ALWAYS configured, and that is a real answer rather than a stub.
   *
   * Unlike Slack, this channel has no optional external dependency: it writes
   * to our own notification centre through our own queue. The queue can be
   * absent (no REDIS_URL), but that is not THIS channel's condition to report —
   * without a queue the producer cannot enqueue the alert job in the first
   * place, so it already surfaces that once, for the alert as a whole. Reporting
   * it a second time here as "in_app is not configured" would name the wrong
   * cause: nothing about the in-app channel is unconfigured.
   *
   * The consequence worth stating: a deployment with no Slack still alerts, and
   * `enqueueAlert`'s "reached no channel" warning stays meaningful because this
   * channel never opts itself out.
   */
  configured() {
    return true
  },

  async deliver(alert, deps) {
    // The roster, minus anyone this kind says is conflicted. `mediatorUserIds`
    // requires the exclusion list explicitly — it has no default — so a kind
    // that forgot to declare one cannot silently page a party to the dispute.
    const recipients = await mediatorUserIds(deps, inAppExcludedIds(alert))
    if (recipients.length === 0) {
      // Already warned, with counts, by `mediatorUserIds` — it can tell "we
      // have no admins" from "every admin is a party" and this cannot, so a
      // second line here would be strictly less informative noise.
      return
    }

    const names = await loadAlertPartyNames(deps.db, inAppPartyIds(alert))

    const notice = inAppNotice(alert, names)
    if (notice === null) {
      // Unreachable while `kinds` is derived from the same map this consults.
      // Warned rather than thrown: no retry writes the missing copy.
      deps.log.warn({ channel: NAME, kind: alert.kind }, 'no in-app copy for this alert kind')
      return
    }

    // Per RECIPIENT, and that is load-bearing: `notifications.id` is the primary
    // key, so one id shared across the roster would let persistNotification's
    // onConflictDoNothing drop every row after the first — the fan-out would
    // silently notify exactly one admin. Seeded from `alertIdentity` so a
    // redelivered alert job re-derives the same ids and writes no second row.
    await enqueueNotificationToMany(deps.queue, recipients, {
      ...notice,
      idFor: (user_id) => stableNotificationId(ID_NAMESPACE, alertIdentity(alert), user_id),
    })

    deps.log.info(
      { channel: NAME, kind: alert.kind, recipients: recipients.length },
      'alert delivered in-app',
    )
  },
}
