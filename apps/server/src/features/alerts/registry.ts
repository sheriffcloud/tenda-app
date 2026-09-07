/**
 * The channel registry — the ONE list of where alerts can go.
 *
 * This file is the whole plug-in seam. Adding a channel is one implementation
 * file plus one line in `ALERT_CHANNELS`; removing one is deleting both, with
 * nothing else in the codebase naming it. Nothing outside this module imports a
 * concrete channel, so no consumer has to change either way.
 *
 * Deliberately NOT a `channels/index.ts` barrel re-exporting the same set: a
 * second list is a second thing to keep in step, and the failure mode is a
 * channel that looks registered from one file and isn't from the other.
 *
 * An ARRAY rather than a `Record<AlertChannelName, …>`, which is the shape that
 * would also force every declared name to be live. The record buys that at the
 * cost of a second spelling of each channel's name — the key and `channel.name`
 * — which can disagree, and a channel that logs itself as one name while
 * registered under another is untraceable in production. The array has exactly
 * one spelling, so that class of bug cannot occur; the coverage the record
 * would have given is asserted at runtime instead (see the tests), where it
 * reads as the question it actually is: "is there a channel nobody registered?"
 */

import { inAppAlertChannel } from './channels/in-app'
import { slackAlertChannel } from './channels/slack'
import type { AlertChannel, AlertChannelName, AlertKind } from './types'

/**
 * Every live channel, in delivery order.
 *
 * An empty registry would be a legitimate state, not a broken one — it means
 * alerts resolve and reach nobody, which is what a deployment with no channels
 * configured should do. Registration is not configuration: a channel listed
 * here still reports itself unconfigured until its env is set.
 *
 * Slack leads because it reaches a mediator who is not in the product, and it
 * is the one that can be unconfigured — putting it first means the common
 * "nothing is set up" case is decided before any work is done. Order is
 * otherwise not significant: the producer enqueues one INDEPENDENT job per
 * channel, so neither waits on nor can fail the other.
 */
export const ALERT_CHANNELS: readonly AlertChannel[] = [slackAlertChannel, inAppAlertChannel]

/** Names of the live channels — what is registered, not what is declarable. */
export function alertChannelNames(): AlertChannelName[] {
  return ALERT_CHANNELS.map((channel) => channel.name)
}

/**
 * Look up a channel by name, or null if no channel answers to it.
 *
 * NEVER throws, and takes a plain `string` on purpose: the caller is a queue
 * consumer reading a name off a job that may have been enqueued by an EARLIER
 * DEPLOY, one that had a channel this build no longer registers. A throw there
 * would crash-loop the job through all 5 attempts and bury a real alert behind
 * a channel that no longer exists; null lets the consumer skip it and deliver
 * to the channels that do.
 */
export function channelByName(name: string): AlertChannel | null {
  return ALERT_CHANNELS.find((channel) => channel.name === name) ?? null
}

/**
 * The live channels that accept `kind`, in delivery order.
 *
 * Reads the channels' own opt-in lists rather than a kind→channel map kept
 * here: the channel is what knows whether it has copy for a kind, and a map
 * here would be a second place to update when one gains or drops one.
 */
export function channelsFor(kind: AlertKind): AlertChannel[] {
  return ALERT_CHANNELS.filter((channel) => channel.kinds.includes(kind))
}
