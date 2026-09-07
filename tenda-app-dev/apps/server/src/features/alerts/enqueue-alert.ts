/**
 * The alerts producer — one escrow event in, one queued job per channel out.
 *
 * Two steps, deliberately separate functions:
 *
 *   EscrowRepublishEvent ──alertRefForEscrowEvent──▶ AlertRef | null
 *   AlertRef ─────────────enqueueAlert────────────▶ one job per channel
 *
 * Split because the first is a pure, synchronous decision ("is this event worth
 * an alert?") that the caller can make before touching the queue, and the second
 * is the side effect. A single `maybeAlertOnEscrowEvent(event)` would fuse them
 * and force every test of the mapping to stand up a queue.
 *
 * Named for the direction of travel, paired with ./deliver-alert.
 *
 * NEVER THROWS (G5). The caller is the escrow fan-out, which continues on to
 * the party push notices after this returns; an exception here would cost the
 * PARTIES their notification because an OPERATOR's alert failed, which inverts
 * the priority. verify-tx does wrap its republish in a catch, so this is the
 * second layer, not the only one — but the fan-out work that runs after the
 * hook point is only protected by this one.
 */

import { alertJobId } from './identity'
import { channelsFor } from './registry'
import type { AlertChannel, AlertKind, AlertLogger, AlertRef } from './types'
import type { QueueService } from '@server/plugins/queue'
import type { EscrowRepublishEvent, InternalEscrowEvent } from '@server/lib/escrow-events'

// ---------- escrow event → alert ref -------------------------------------

/**
 * Builds the queued ref for one alert-worthy escrow event.
 *
 * Takes the whole event rather than the two fields today's only entry reads:
 * a future kind will want `counterparty_id` or an applicant list, and widening
 * the parameter later would touch every entry.
 */
type AlertRefBuilder = (event: EscrowRepublishEvent) => AlertRef

/**
 * Which escrow events raise an alert. `Partial` on purpose — most transitions
 * are nobody's incident, and an exhaustive map would force thirteen `undefined`
 * entries whose only content is "still not an alert".
 *
 * A TABLE rather than a switch, and exported, for the same reason `REPEATABLES`
 * and `WORKER_CONCURRENCY` are: it is enumerable at runtime, so the test can ask
 * "is every internal event either mapped here or on the deliberately-silent
 * list?" — the composition question a hand-written list in a test cannot answer
 * without drifting. This codebase has shipped that drift twice.
 */
export const ALERT_REF_BY_EVENT: Readonly<
  Partial<Record<InternalEscrowEvent, AlertRefBuilder>>
> = {
  'escrow.dispute_raised': (event) => ({
    kind: 'dispute.raised',
    escrow_id: event.escrow_id,
    // The chain-attested tx, not the `disputes` row: the row may not exist yet.
    // See AlertRefFields in ./types for why this is the idempotency key.
    tx_ref: event.tx_ref,
  }),
}

/** The alert this event raises, or null when it raises none. */
export function alertRefForEscrowEvent(event: EscrowRepublishEvent): AlertRef | null {
  return ALERT_REF_BY_EVENT[event.internal_event]?.(event) ?? null
}

/**
 * Retry budget for one alert delivery, against the queue-wide default of 5.
 *
 * Lower on purpose. With exponential backoff from 2s these three attempts are
 * spent inside ~6s, which covers what retrying can actually fix: a dropped
 * connection, a rate-limit blip, a pod mid-restart. It does not pretend to
 * cover a Slack outage — those last minutes, and even the full five attempts
 * would not outlive one. What recovers a genuinely missed alert is that the
 * dispute stays in the admin queue until a mediator claims it, so burning a
 * worker slot on backoff buys nothing an operator would notice.
 */
export const ALERT_JOB_ATTEMPTS = 3

// ---------- enqueue ------------------------------------------------------

/**
 * How the channels for a kind are chosen. Defaults to the real registry, so no
 * production caller can pass the wrong one by omission — the seam exists only
 * so a test can supply channels, since `ALERT_CHANNELS` is the single list by
 * design and a test must not be able to add to it.
 *
 * The exact counterpart of `ChannelLookup` in ./deliver-alert.
 */
export type ChannelSelector = (kind: AlertKind) => AlertChannel[]

/**
 * Enqueue one alert for one channel. Returns whether a job landed.
 *
 * The guard sits HERE, per channel, rather than around the whole loop: Slack
 * throwing must not cost the in-app write, which is the same reason the two are
 * separate jobs in the first place. `configured` is inside it because the
 * contract says a channel must not throw from it and a contract is not a
 * runtime guarantee.
 */
async function enqueueToChannel(
  queue: Pick<QueueService, 'enqueue'>,
  ref: AlertRef,
  channel: AlertChannel,
  log: AlertLogger,
): Promise<boolean> {
  const context = { kind: ref.kind, channel: channel.name }
  try {
    // Checked here so an unconfigured channel costs no Redis round-trip and no
    // job that only exists to be skipped. ./deliver-alert re-checks rather than
    // trusting this, because the env can change between the two.
    if (!channel.configured()) return false

    await queue.enqueue(
      'alerts',
      { ref, channel: channel.name },
      { job_id: alertJobId(ref, channel.name), attempts: ALERT_JOB_ATTEMPTS },
    )
    return true
  } catch (err) {
    // Reached without Redis (the queue stub 501s by design), and on a genuine
    // Redis failure. Warned either way: the difference does not change what an
    // operator does about it, and this is the alert path going quiet.
    log.warn({ ...context, err }, 'failed to enqueue alert')
    return false
  }
}

/**
 * Fan one alert out to every channel that accepts its kind and is configured.
 *
 * Sequential rather than `Promise.all`: it is at most one job per channel for an
 * event that happens a handful of times a day, and the fan-out beside it
 * (workers/escrow-fanout) awaits its enqueues in order too.
 */
export async function enqueueAlert(
  queue: Pick<QueueService, 'enqueue'>,
  ref: AlertRef,
  log: AlertLogger,
  selectChannels: ChannelSelector = channelsFor,
): Promise<void> {
  try {
    const channels = selectChannels(ref.kind)
    let enqueued = 0
    for (const channel of channels) {
      if (await enqueueToChannel(queue, ref, channel, log)) enqueued += 1
    }

    if (enqueued === 0) {
      // The one outcome this feature exists to prevent: something happened and
      // no human will hear about it. Warned even when the cause is mundane
      // (nothing registered yet, nothing configured) because the consequence is
      // identical, and `registered` says which of the two it was.
      log.warn(
        { kind: ref.kind, registered: channels.length },
        'alert reached no channel — nobody will be told',
      )
    } else {
      // The only record that the producer RAN. Everything downstream logs from
      // the worker, so without this line a missing alert cannot be told apart
      // from a producer that was never called. One line per dispute.
      log.info({ kind: ref.kind, channels: enqueued }, 'alert enqueued')
    }
  } catch (err) {
    // The loop body is fully guarded, so what actually reaches here is narrow:
    // `selectChannels` throwing, iterating what it returned throwing, or the
    // summary log below throwing. Kept because G5 is absolute and the cost is a
    // try block.
    //
    // The one assumption G5 rests on and cannot itself guarantee is that the
    // LOGGER does not throw — if it did, the per-channel catch would rethrow
    // into here, and this line would throw again on the way out. Guarding a log
    // call with a log call has no bottom, so it is an assumption rather than a
    // defence, and it is the same one verify-tx's republish catch and
    // deliverAlert's skip paths already make.
    log.warn({ kind: ref.kind, err }, 'alert fan-out failed')
  }
}
