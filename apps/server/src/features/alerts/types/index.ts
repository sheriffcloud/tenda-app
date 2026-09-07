/**
 * Operational alert contracts — "something happened that a HUMAN OPERATOR must
 * act on", as distinct from lib/notify/, which tells the parties to an escrow
 * what happened to their own escrow.
 *
 * The split exists because the two have different audiences, different
 * delivery targets and different failure postures: a party notice reaches one
 * user's devices and is best-effort, while an alert reaches whoever holds a
 * permission, may leave the product entirely (Slack), and going quiet is
 * itself the incident. A dispute nobody is told about sits until a party
 * chases it.
 *
 * Shape of the pipeline, one direction only:
 *
 *   AlertRef ──resolve──▶ Alert ──registry──▶ AlertChannel[] ──deliver──▶ 🌍
 *   (queued, thin)        (fat, DB-read)      (opt-in by kind)
 *
 * `AlertRef` is what rides the queue: identifiers only, resolved to an `Alert`
 * inside the worker. Queueing the fat object instead would freeze the facts at
 * enqueue time, so a retry hours later would deliver a stale title or a
 * dispute_id that was still null when the job was created.
 *
 * Adding a kind is one entry in `ALERT_KINDS` plus the two `Record<AlertKind,…>`
 * maps in ./alert, which then fail to compile until the ref shape, the resolved
 * shape and a resolver all exist. Adding a channel is one `AlertChannel`
 * implementation plus one registry entry (see ../registry).
 *
 * Was ONE file until it reached 293 lines with a second kind pending; split at
 * the seam the pipeline arrow already draws — ./alert is everything left of
 * `registry`, ./channel everything right of it. The `./types` import path is
 * unchanged for every consumer, which is why this barrel exists at all.
 *
 * Named re-exports, not `export *`, matching ../index: `export type` marks what
 * is erased and `export` what survives to runtime, and no `__exportStar` loop
 * is emitted.
 *
 * Be straight about what that costs: this is now the SECOND barrel listing the
 * same names, so a NEW CONTRACT is three edits (its module, here, ../index)
 * where it used to be two. Adding a KIND or a CHANNEL is still one edit — those
 * go into `ALERT_KINDS` / `ALERT_CHANNEL_NAMES` and the per-kind maps without
 * introducing a name — which is the change that actually happens. The drift is
 * loud either way: a consumer importing a name no barrel carries fails to
 * compile at the import.
 */

export { ALERT_KINDS } from './alert'
export type {
  Alert,
  AlertKind,
  AlertOf,
  AlertRef,
  AlertRefOf,
  AlertResolver,
} from './alert'

export { ALERT_CHANNEL_NAMES } from './channel'
export type {
  AlertChannel,
  AlertChannelName,
  AlertDeps,
  AlertJob,
  AlertLogger,
} from './channel'
