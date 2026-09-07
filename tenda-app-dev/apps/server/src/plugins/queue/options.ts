/**
 * How a job behaves once it is on a queue — the caller-facing `EnqueueOptions`,
 * the app-wide defaults every Queue is constructed with, and the translation
 * between them and BullMQ's own spelling.
 *
 * Every function here is PURE, which is the reason they sit together and apart
 * from the plugin. The plugin's Redis-backed path is unreachable from CI (the
 * suite only ever exercises its no-REDIS_URL stub), so the code that path runs
 * is checked by calling it directly instead. A field silently dropped in
 * `toJobOptions`, or a retention bound quietly removed from
 * `DEFAULT_JOB_OPTIONS`, fails nothing at runtime — a test is the only thing
 * that notices, so they are kept where a test can reach them.
 */

import type { QueueConnectionOptions } from './connection'
import type { JobName, JobPayload } from './payloads'

// ---------- what a caller may ask for ------------------------------------

export interface EnqueueOptions {
  /** Idempotency key, BullMQ `jobId`. Same id de-dups across enqueues. */
  job_id?: string
  /** Delay before the job becomes available, in milliseconds. */
  delay_ms?: number
  /** Max retry attempts; defaults defined by #33 worker config. */
  attempts?: number
  /**
   * Drop the job from Redis the moment it completes, overriding the queue's
   * default retention. Set for jobs whose payload carries a secret (e.g.
   * `send-otp`'s plaintext code) so it doesn't linger in completed-job history.
   */
  remove_on_complete?: boolean
}

/**
 * One job in a bulk enqueue — the same pair a single `enqueue` takes.
 *
 * Per-job `opts` rather than one set shared by the batch, because the options
 * that matter here are per-job by nature: `job_id` is an idempotency key, and a
 * batch that shared one would de-dup itself down to a single job.
 */
export interface BulkJob<N extends JobName> {
  payload: JobPayload[N]
  opts?: EnqueueOptions
}

// ---------- the defaults every queue is built with ------------------------

/**
 * Default retry posture, verify-tx overrides per its confirmation cadence.
 *
 * Exported because a per-queue override is only meaningful RELATIVE to this —
 * `ALERT_JOB_ATTEMPTS` exists to be lower than `attempts` here, and a test that
 * pinned the literal 5 would keep passing after someone changed this to 3 and
 * made the override a no-op. Same reasoning as exporting WORKER_CONCURRENCY.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: { age: 24 * 3_600, count: 5_000 },
  // Both bounds, deliberately — age alone is not a bound.
  //
  // `age` only evicts as fast as failures ARRIVE (BullMQ evaluates retention
  // inside moveToFinished, it runs no background timer), so during the one
  // situation this retention exists for — a sustained outage: a push provider
  // down, a dead Slack webhook, an RPC rejecting everything — a week's worth
  // accumulates with no ceiling. `notifications` is where that bites: one
  // popular gig fans out to one job per subscriber, so a 50,000-subscriber gig
  // that exhausts its attempts leaves 50,000 failed job hashes in Redis from a
  // SINGLE post. Precisely when memory pressure is least welcome.
  //
  // 5,000, matching removeOnComplete because the two want the same thing (a
  // bounded finished set) and one number needs one justification: the failures
  // that pile up in an outage are all the same failure, so the 5,000th adds
  // nothing to the 50th. What is retained is for inspecting payloads and
  // re-driving, not for noticing — BullMQ emits `failed` on every attempt (the
  // worker awaits moveToFailed, which itself decides retry-or-terminal via
  // shouldRetryJob), so the handler in plugins/workers.ts has already logged
  // every one of them: `worker: job failed` at warn, or the info line for a
  // RetryableError the reconcile repeatable takes over.
  //
  // Per queue, not app-wide: BullMQ trims the queue's own `failed` zset, so the
  // real ceiling is 5,000 × the number of JobNames.
  //
  // Honest cost: count evicts OLDEST first (ZREVRANGE keeps the newest —
  // measured: 10 failures under a cap of 3 retained jobs 8, 9, 10), so an
  // outage past 5,000 loses its onset, usually the most diagnostic failure.
  // BullMQ offers no keep-oldest mode; the log lines above are what survive it.
  removeOnFail: { age: 7 * 24 * 3_600, count: 5_000 },
}

/**
 * Reconciliation deliberately reuses a verify transaction's deterministic
 * job id. A terminally failed BullMQ record would deduplicate that enqueue, so
 * this queue removes failures atomically once its attempts are exhausted. The
 * durable tx_attempt row and worker logs retain the operational evidence.
 */
export const VERIFY_TX_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  removeOnFail: true,
} as const

/**
 * The options EVERY `new Queue(...)` in this app is constructed with.
 *
 * A function rather than two call sites spelling out the same object literal,
 * because the two had already diverged and the divergence put the retention
 * above out of reach of the queues that tick forever. plugins/workers.ts
 * builds a Queue per repeatable to register its scheduler and passed
 * `{ connection }` alone — so every tick those schedulers produced carried NO
 * retention at all (BullMQ merges the registering queue's `defaultJobOptions`
 * into the scheduler template, and undefined there means keep forever).
 * Measured against real Redis: with a bare `{ connection }`, nothing was ever
 * trimmed — waiting on 8 scheduler-produced completions left 11 completed
 * hashes behind (the scheduler kept firing while the probe settled) and every
 * job carried `opts.removeOnComplete: undefined`. The same probe with these
 * options held at the cap. REPEATABLES runs three schedulers every 60s and two
 * every 5min, so that is ~4,900 completed job hashes a day, accumulating for
 * the life of the deployment. Not a bigger number than the uncapped
 * `removeOnFail` this task set out to close — an outage can out-produce it in
 * minutes — but a worse shape: that one needed something to go wrong and
 * stopped when it was fixed, this one ran on a healthy system and never
 * stopped. Sitting one file away from the constant meant to bound it.
 *
 * Guarded by a source scan in test/unit/queue.test.ts rather than by review: a
 * bare `new Queue(name, { connection })` compiles, runs, and passes every
 * behavioural test, because nothing about it is wrong except what Redis keeps.
 */
export function queueOptions(connection: QueueConnectionOptions, name?: JobName) {
  return {
    connection,
    defaultJobOptions: name === 'verify-tx' ? VERIFY_TX_JOB_OPTIONS : DEFAULT_JOB_OPTIONS,
  }
}

// ---------- crossing the BullMQ boundary ----------------------------------
//
// Both directions: `toJobOptions` translates what we asked for into BullMQ's
// spelling, `resolveJobId` reads back what it answered.

/**
 * The subset of BullMQ's `JobsOptions` this app sets — declared rather than
 * imported so the mapping below has a return type that changes only when we
 * decide it does, not when BullMQ widens its own.
 */
export interface BullJobOptions {
  jobId?: string
  delay?: number
  attempts?: number
  removeOnComplete?: boolean
}

/**
 * `EnqueueOptions` → BullMQ's `JobsOptions`, in ONE place.
 *
 * Both producer paths map the same four fields, and a second copy is how
 * `remove_on_complete` ends up honoured by single enqueues and quietly dropped
 * by bulk ones — a divergence that leaks a `send-otp` code into completed-job
 * history and fails no test.
 *
 * Exported for the same reason `queueConnectionOptions` is: it is a pure
 * function on the live path, and the live path needs Redis. Without this it
 * would be reachable only from a Redis-backed test — which CI does not run — so
 * dropping a field here would fail nothing.
 */
export function toJobOptions(opts?: EnqueueOptions): BullJobOptions {
  return {
    ...(opts?.job_id !== undefined ? { jobId: opts.job_id } : {}),
    ...(opts?.delay_ms !== undefined ? { delay: opts.delay_ms } : {}),
    ...(opts?.attempts !== undefined ? { attempts: opts.attempts } : {}),
    ...(opts?.remove_on_complete !== undefined
      ? { removeOnComplete: opts.remove_on_complete }
      : {}),
  }
}

/**
 * The id BullMQ assigned, or the one the caller asked for, or an admission that
 * we do not know.
 *
 * Both producer paths need this three-step fallback, and two copies of it drift
 * the same way `toJobOptions` would: someone changes the sentinel in one and a
 * log line starts saying something different depending on which path ran.
 * `job.id` is optional on BullMQ's `Job`, which is why there is a fallback at
 * all.
 *
 * Private until the split moved it out of the file that calls it, so exporting
 * it is forced. That is a gain rather than a cost: it shares `toJobOptions`'s
 * problem exactly — pure, on the Redis-only path, silent when wrong — and
 * being private meant nothing could reach it to check the fallback order.
 */
export function resolveJobId(id: string | undefined, opts?: EnqueueOptions): string {
  return id ?? opts?.job_id ?? 'unknown'
}
