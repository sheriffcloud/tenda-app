/**
 * The Slack alert channel — an `AlertChannel` over features/alerts/slack's generic
 * transport.
 *
 * The split is the point: features/alerts/slack knows how to post to a webhook and nothing
 * about disputes, this file knows about alerts and nothing about HTTP. So the
 * transport stays reusable by anything else that wants Slack, and swapping this
 * channel out is deleting this folder and one line of ../../registry.
 *
 * WHERE an alert lands is a per-kind fact, read from ./copy — disputes go to
 * the mediation room, gas-seed balances to the operators'. This file never
 * names a destination itself; the room and the wording are declared together in
 * one map, so neither this file nor the registry has to be touched to add a
 * kind that goes somewhere new.
 *
 * Nothing outside the registry imports this module, which is what keeps
 * "unplug Slack" a one-line change rather than a search.
 *
 * The two failure postures the contract demands, both honoured below:
 *   configured() — never throws. Slack is OPTIONAL; dev and self-hosted
 *                  deployments run without a webhook and must not see errors.
 *   deliver()    — throws on failure, so BullMQ retries. A swallowed 503 is
 *                  permanent silence, the one thing an alert path may not do.
 *
 * DELIVERY IS AT-LEAST-ONCE, and that is a choice rather than an oversight. The
 * job id de-duplicates at ENQUEUE (one job per tx_ref per channel while it is in
 * Redis), but a retry re-runs this function, so a worker that posts and then
 * dies before acking posts again on the redelivery. An incoming webhook has no
 * idempotency key to prevent it. A duplicate line in a Slack channel costs an
 * operator a second glance; suppressing it would mean recording "sent" before
 * the send, which loses the alert outright whenever that record outlives a
 * failure. Note the asymmetry with the in-app channel (#13), which CAN be
 * exactly-once because a notification row has a stable id to conflict on — the
 * two differ because their sinks differ, not because one was overlooked.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { postToSlackWebhook, resolveSlackDestination } from '@server/features/alerts/slack'
import { loadAlertPartyNames } from '../../identity/identities'
import type { AlertChannel, AlertChannelName } from '../../types'
import {
  SLACK_ALERT_KINDS,
  slackAlertDestination,
  slackAlertMessage,
  slackAlertPartyIds,
} from './render/copy'

/** The registry name. Typed so it must be one `ALERT_CHANNEL_NAMES` declares. */
const NAME: AlertChannelName = 'slack'

export const slackAlertChannel: AlertChannel = {
  name: NAME,

  // Derived from the copy map, so this channel accepts exactly the kinds it can
  // actually write a message for — see ./copy.
  kinds: SLACK_ALERT_KINDS,

  configured(kind, env = process.env) {
    // PER KIND: this channel routes its kinds to different rooms, and the two
    // webhooks are configured independently. A deployment that set up the
    // mediation room and not the operators' one must answer "yes" for a dispute
    // and "no" for a low balance — one answer for both would either mute the
    // configured half or push the unconfigured half into `deliver`, which
    // throws.
    const destination = slackAlertDestination(kind)
    if (destination === null) return false

    // `resolveSlackDestination` already answers this without throwing for every
    // unset, blank or malformed value, so there is nothing to guard.
    return resolveSlackDestination(destination, env) !== null
  },

  async deliver(alert, deps) {
    // Re-derived from the SAME function `configured` consulted, not carried
    // over from it: the two must agree about where this alert was headed, and
    // one lookup they both call is what makes that structural rather than
    // remembered.
    const destination = slackAlertDestination(alert.kind)
    const cfg = destination === null ? null : resolveSlackDestination(destination, deps.env)
    if (cfg === null) {
      // `deliver` MAY ASSUME `configured(alert.kind, deps.env)` — the consumer
      // filters, and it re-checks the same kind against this same env. Reaching
      // here means the two disagreed, which is a wiring bug in the caller, not a
      // missing webhook, so it throws like any other failure rather than
      // skipping quietly. A silent return here would make "nobody set this room
      // up" and "the filter is broken" produce identical, invisible outcomes.
      throw new AppError(
        500,
        ErrorCode.INTERNAL_ERROR,
        // Names the KIND as well as the room: with more than one destination,
        // "'ops' is not configured" alone does not say which alert was lost, and
        // a null destination has no room to name at all.
        `slack alert channel: no configured destination for kind '${alert.kind}'` +
          (destination === null ? '' : ` (destination '${destination}')`),
      )
    }

    // One query for every name the message mentions, before composing — the
    // copy is pure and takes the names it needs (see ./copy).
    const names = await loadAlertPartyNames(deps.db, slackAlertPartyIds(alert))

    const message = slackAlertMessage(alert, names, deps.env)
    if (message === null) {
      // Unreachable while `kinds` is derived from the same map this consults,
      // and `deliverAlert` filters on `kinds` besides. Kept because the
      // alternative to a log is posting nothing with no trace, and warned
      // rather than thrown because no retry writes the missing copy.
      deps.log.warn({ channel: NAME, kind: alert.kind }, 'no slack copy for this alert kind')
      return
    }

    // Deliberately unguarded: a throw here is the retry signal.
    await postToSlackWebhook(cfg, message)

    deps.log.info(
      { channel: NAME, kind: alert.kind, destination },
      'alert delivered to slack',
    )
  },
}
