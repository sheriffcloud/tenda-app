/**
 * The Slack alert channel — an `AlertChannel` over lib/slack's generic
 * transport.
 *
 * The split is the point: lib/slack knows how to post to a webhook and nothing
 * about disputes, this file knows about alerts and nothing about HTTP. So the
 * transport stays reusable by anything else that wants Slack, and swapping this
 * channel out is deleting this folder and one line of ../../registry.
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
import { postToSlackWebhook, resolveSlackDestination } from '@server/lib/slack'
import type { SlackDestinationKey } from '@server/lib/slack'
import { loadAlertPartyNames } from '../../identities'
import type { AlertChannel, AlertChannelName } from '../../types'
import { SLACK_ALERT_KINDS, slackAlertMessage, slackAlertPartyIds } from './copy'

/**
 * Where these alerts land. Named ONCE: `configured()` and `deliver()` must ask
 * about the same destination, or the channel reports itself ready against one
 * webhook and posts to another — or to none, having passed its own check.
 *
 * Typed as `SlackDestinationKey`, so removing the entry from
 * lib/slack/destinations.ts fails the build here instead of resolving to null
 * at runtime and going quietly mute.
 */
const DESTINATION: SlackDestinationKey = 'disputes'

/** The registry name. Typed so it must be one `ALERT_CHANNEL_NAMES` declares. */
const NAME: AlertChannelName = 'slack'

export const slackAlertChannel: AlertChannel = {
  name: NAME,

  // Derived from the copy map, so this channel accepts exactly the kinds it can
  // actually write a message for — see ./copy.
  kinds: SLACK_ALERT_KINDS,

  configured(env = process.env) {
    // `resolveSlackDestination` already answers this without throwing for every
    // unset, blank or malformed value, so there is nothing to guard.
    return resolveSlackDestination(DESTINATION, env) !== null
  },

  async deliver(alert, deps) {
    const cfg = resolveSlackDestination(DESTINATION, deps.env)
    if (cfg === null) {
      // `deliver` MAY ASSUME `configured(deps.env)` — the consumer filters, and
      // it re-checks against this same env. Reaching here means the two
      // disagreed, which is a wiring bug in the caller, not a missing webhook,
      // so it throws like any other failure rather than skipping quietly. A
      // silent return here would make "nobody set Slack up" and "the filter is
      // broken" produce identical, invisible outcomes.
      throw new AppError(
        500,
        ErrorCode.INTERNAL_ERROR,
        `slack alert channel: destination '${DESTINATION}' is not configured`,
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

    deps.log.info({ channel: NAME, kind: alert.kind }, 'alert delivered to slack')
  },
}
