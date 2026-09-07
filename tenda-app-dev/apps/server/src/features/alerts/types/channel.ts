/**
 * Delivery-side alert contracts: where an alert can go, what a channel needs to
 * send it, and what the queue carries between the two.
 *
 * Split from ./alert, which owns the kinds and the ref→alert shapes. The
 * dependency runs ONE WAY — this file imports from ./alert (a job carries a
 * ref, a channel accepts kinds and delivers an alert) and ./alert must never
 * import back. That is the same directionality the pipeline itself has, so a
 * cycle here would mean the pipeline had grown one. Enforced by a source scan
 * in test/unit/alerts-registry.test.ts, which also asserts THIS import still
 * exists — otherwise the guard would pass with nothing left to guard.
 */

import type { QueueService } from '@server/plugins/queue'
import type { AppDatabase } from '@server/plugins/db'
import type { Alert, AlertKind, AlertRef } from './alert'

/**
 * Where alerts can go. Also a runtime array: the registry is keyed by these,
 * and a channel that exists but is registered nowhere delivers nothing.
 */
export const ALERT_CHANNEL_NAMES = ['slack', 'in_app'] as const

export type AlertChannelName = (typeof ALERT_CHANNEL_NAMES)[number]

/**
 * One queued unit of work: deliver THIS alert to THIS channel.
 *
 * One job per channel, never one job that loops them. BullMQ retries whole
 * jobs, so a combined job whose Slack post succeeded and whose in-app write
 * threw would re-post to Slack on every retry. The alternative — catching and
 * never rethrowing — loses the alert permanently on a transient 503, which is
 * the one thing an alert path may not do. Per-channel jobs let each fail, retry
 * and succeed on its own.
 *
 * Carries the thin `ref`, not a resolved `Alert`: the facts are read at
 * delivery time so a retry sees the world as it is then, not as it was at
 * enqueue (see the pipeline note in ./index).
 */
export interface AlertJob {
  ref: AlertRef
  /**
   * Typed as a channel this build knows, which is true of every job this build
   * WRITES — and not necessarily of one it READS. Payloads are JSON in Redis
   * and types are erased, so a job enqueued by an earlier deploy can carry a
   * name that has since been removed from `ALERT_CHANNEL_NAMES`; the value
   * arrives as a plain string that no longer inhabits this type.
   *
   * That is why the consumer's lookup takes `string` rather than
   * `AlertChannelName` (see ChannelLookup in ../deliver-alert). Narrow on the
   * write side so a producer cannot invent a channel; wide on the read side so
   * an in-flight job from the previous deploy is skipped instead of crashing.
   */
  channel: AlertChannelName
}

/** What a channel needs to do its work. */
export interface AlertDeps {
  db: AppDatabase
  /**
   * Narrowed to `enqueueMany`: the in-app channel produces notification jobs,
   * and it produces them for the whole mediator roster at once.
   */
  queue: Pick<QueueService, 'enqueueMany'>
  log: AlertLogger
  /**
   * The environment both `configured()` and `deliver()` read — threaded rather
   * than reached for, so a test can prove "posts to the configured webhook"
   * without mutating `process.env` and leaking that into every later test in
   * the file. The consumer resolves it once and passes the SAME value to both,
   * so a channel cannot report itself configured against one env and then
   * deliver against another.
   */
  env: NodeJS.ProcessEnv
}

/**
 * Minimal structural logger, declaring exactly the levels this module calls —
 * the convention `ExpireEscrowsDeps` and `PushLogger` already follow. A test
 * passes `{ info() {}, warn() {} }` rather than standing up a real pino.
 */
export interface AlertLogger {
  info(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
}

/**
 * A delivery target. Detachable by construction: nothing outside ../registry
 * names a concrete channel, so removing one is deleting its file and its
 * registry line.
 */
export interface AlertChannel {
  name: AlertChannelName

  /**
   * Kinds this channel accepts — an explicit opt-in, never "everything".
   *
   * Opt-in rather than opt-out so a NEW kind reaches nobody loudly (the
   * registry coverage test fails) instead of quietly paging every channel
   * with something it has no copy for.
   */
  kinds: readonly AlertKind[]

  /**
   * Can this channel deliver right now? MUST NOT THROW — being unconfigured is
   * a normal state, not an error: Slack is optional, and dev and self-hosted
   * deployments run without it. Mirrors `resolveSlackDestination`, which
   * returns null rather than throwing for the same reason.
   *
   * `env` defaults to `process.env` for direct calls; the consumer passes
   * `deps.env` so both halves of the contract read one source.
   */
  configured(env?: NodeJS.ProcessEnv): boolean

  /**
   * Deliver, or THROW. The inverse posture of `configured`: a channel that is
   * set up and still fails must reject so BullMQ retries it. Swallowing here
   * would turn a Slack outage into permanent silence, which is the one failure
   * mode an alerting path cannot have.
   *
   * MAY ASSUME `configured(deps.env)` is true — filtering unconfigured channels
   * is the consumer's job, so reaching here without configuration is a caller
   * bug and should throw like any other failure. That keeps "not set up" (a
   * quiet skip, decided in one place) from ever being confused with "set up and
   * broken" (a retry), which is the distinction the two methods exist to draw.
   */
  deliver(alert: Alert, deps: AlertDeps): Promise<void>
}
