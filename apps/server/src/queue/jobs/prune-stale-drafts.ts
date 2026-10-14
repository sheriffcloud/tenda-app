/**
 * prune-stale-drafts — discards unfunded drafts idle for longer than the retention window.
 *
 * Daily, like the notification retention sweep, and bounded the way
 * expire-escrows is: a batch per statement, a ceiling on batches per tick, so a
 * first run over a long backlog cannot hold the table for one unbounded DELETE.
 * Whatever the ceiling leaves behind goes on the next tick.
 *
 * The retention value is injected, not read: it is the operator's
 * `DRAFT_RETENTION_DAYS`, resolved once where the processor is built.
 */

import { MS_PER_DAY } from '@tenda/shared'

/** Drafts per statement. */
export const PRUNE_STALE_DRAFTS_BATCH = 500
/** Statements per tick: 10,000 drafts a day before the remainder waits for tomorrow. */
export const PRUNE_STALE_DRAFTS_MAX_BATCHES = 20

export interface PruneStaleDraftsDeps {
  discardStale(args: { older_than: Date; limit: number }): Promise<number>
  retention_days: number
  now(): Date
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void }
}

export interface PruneStaleDraftsResult {
  pruned: number
}

export async function handlePruneStaleDrafts(deps: PruneStaleDraftsDeps): Promise<PruneStaleDraftsResult> {
  const older_than = new Date(deps.now().getTime() - deps.retention_days * MS_PER_DAY)
  let pruned = 0
  let drained = false
  for (let batch = 0; batch < PRUNE_STALE_DRAFTS_MAX_BATCHES && !drained; batch += 1) {
    const discarded = await deps.discardStale({ older_than, limit: PRUNE_STALE_DRAFTS_BATCH })
    pruned += discarded
    drained = discarded < PRUNE_STALE_DRAFTS_BATCH
  }
  // Silent on an empty tick: this is the normal case and logging it buries the rest.
  if (pruned > 0) deps.log.info({ pruned, retention_days: deps.retention_days }, 'prune-stale-drafts: discarded abandoned drafts')
  if (!drained) deps.log.warn({ pruned }, 'prune-stale-drafts: backlog left for the next tick')
  return { pruned }
}
