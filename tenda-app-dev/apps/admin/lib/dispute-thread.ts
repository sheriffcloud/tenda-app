/**
 * Dispute-thread cursor mechanics (#91) — UI-free so node:test covers them.
 *
 * Server contract (routes/v1/escrows/_id/dispute/messages): the ?after=
 * cursor is INCLUSIVE (gte) so same-millisecond siblings are never
 * skipped; the boundary message re-arrives and the client dedupes by id.
 * Two rules port the mobile hook's bug fixes:
 *   1. dedupe by id + stable sort (created_at, then id) on every merge
 *   2. the cursor advances ONLY from fetched batches — never from local
 *      sends (advancing on send skipped interleaved counterparty messages)
 */
import type { DisputeMessage } from '@tenda/shared'

export function mergeMessages(
  existing: ReadonlyArray<DisputeMessage>,
  incoming: ReadonlyArray<DisputeMessage>,
): DisputeMessage[] {
  const byId = new Map<string, DisputeMessage>()
  for (const m of existing) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) =>
    a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : a.created_at.localeCompare(b.created_at),
  )
}

/** Next poll cursor from a fetched batch; unchanged on an empty batch. */
export function nextCursor(
  current: string | null,
  batch: ReadonlyArray<DisputeMessage>,
): string | null {
  let max = current
  for (const m of batch) {
    if (max === null || m.created_at > max) max = m.created_at
  }
  return max
}
