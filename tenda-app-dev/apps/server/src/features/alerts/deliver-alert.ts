/**
 * The alerts worker body — one job, one channel.
 *
 * Every step before the last is a SKIP, not a failure: the job describes work
 * that may no longer make sense (a channel this deploy dropped, an env that
 * changed, an escrow that vanished), and none of those get better by retrying.
 * Throwing on them would burn all attempts and land a real dispute alert in
 * removeOnFail, where nobody looks.
 *
 * The last step is the inverse. `channel.deliver` is allowed to throw, and must
 * — a configured channel that fails is a transient outage, and BullMQ's retry
 * is the only thing standing between a Slack 503 and permanent silence.
 *
 * Named for the direction of travel, paired with ./enqueue-alert, the same way
 * workers/escrow-fanout/enqueue-notice.ts reads.
 */

import { channelByName } from './registry'
import { resolveAlert } from './resolve-alert'
import type { AlertChannel, AlertDeps, AlertJob } from './types'

/**
 * How a channel name is resolved. Defaults to the real registry, so no
 * production caller can pass the wrong one by omission — the seam exists only
 * so a test can supply a channel, since `ALERT_CHANNELS` is the single list by
 * design and a test must not be able to add to it.
 *
 * The same shape as swapping `app.queue.enqueue` in the fan-out tests: the
 * registry stays the one source of truth, the seam is how a test observes what
 * this function does with it.
 */
export type ChannelLookup = (name: string) => AlertChannel | null

export async function deliverAlert(
  deps: AlertDeps,
  job: AlertJob,
  lookup: ChannelLookup = channelByName,
): Promise<void> {
  const context = { channel: job.channel, kind: job.ref.kind }

  // 1. The channel this job names may not exist any more: a deploy can remove
  //    one while its jobs are still queued. Nothing to deliver to, and no retry
  //    brings it back.
  const channel = lookup(job.channel)
  if (channel === null) {
    deps.log.warn(context, 'alert job names a channel this build does not register')
    return
  }

  // 2. Honour the channel's opt-in at the point of use, not just at enqueue.
  //    The producer filters by `kinds`, but a deploy between enqueue and
  //    delivery can narrow them, and `kinds` is an explicit opt-in precisely so
  //    a channel is never handed a kind it did not ask for.
  if (!channel.kinds.includes(job.ref.kind)) {
    deps.log.warn(context, 'channel no longer accepts this alert kind')
    return
  }

  // 3. Re-checked rather than trusted from enqueue time, for the same reason:
  //    the webhook may have been removed since. Unconfigured is a NORMAL state
  //    (Slack is optional), so this is info, not a warning — an operator who
  //    never set it up does not want a warning per dispute.
  if (!channel.configured(deps.env)) {
    deps.log.info(context, 'alert channel is not configured, skipping')
    return
  }

  // 4. The subject can be gone — an escrow deleted between the chain event and
  //    this job. `resolveAlert` says so with null rather than throwing, so the
  //    job is dropped instead of burning its whole retry budget against a row
  //    that will never come back. Warned, not info: an alert was raised and
  //    nobody will hear about it.
  const alert = await resolveAlert(deps.db, job.ref)
  if (alert === null) {
    deps.log.warn(context, 'alert subject no longer exists, dropping')
    return
  }

  // 5. Deliberately unguarded. A throw here is the retry signal.
  await channel.deliver(alert, deps)
}
