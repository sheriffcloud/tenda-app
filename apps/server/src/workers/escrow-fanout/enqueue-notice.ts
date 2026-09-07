/**
 * The one way this module reaches a user: enqueue the same notice to a list of
 * recipients, deep-linked at the escrow it is about.
 *
 * The escrow-flavoured face of `enqueueNotificationToMany` — all this adds is
 * the `data` bag, the bag whose `kind` decides whether the deep link opens
 * /gig/:id or /exchange/:id. The loop itself lives in lib/notify/ because the
 * dispute-alert fan-out needs the identical one with a different bag, and two
 * copies of "how one notice reaches N users" is one too many.
 */

import { enqueueNotificationToMany, escrowPushData } from '@server/lib/notify'
import type { QueueService } from '@server/plugins/queue'
import type { EscrowKind } from '@tenda/shared'
import type { NoticeCopy } from './copy'

export async function enqueueEscrowNotice(
  // The queue rather than the whole app: this function touches nothing else on
  // fastify. Narrowed to the ONE method it reaches — the fan-out below sends a
  // batch, never a single job — so a caller can hand it a double with nothing
  // else on it.
  queue: Pick<QueueService, 'enqueueMany'>,
  escrow_id: string,
  kind: EscrowKind,
  // Nullable ids are accepted so callers can pass a party that may be absent
  // (an unassigned counterparty) without filtering at every call site.
  user_ids: readonly (string | null)[],
  notice: NoticeCopy,
  // Per-recipient stable id, for the ONE caller that can be re-run for the same
  // notice: the subscriber expansion is a retried BullMQ job, so a failure on
  // page 40 replays pages 1-39. Without this the replay writes a second
  // notification-centre row and a second badge for everyone already reached.
  // The party and applicant notices need no such key — they are produced inside
  // the verify-tx republish, whose errors are swallowed rather than retried.
  idFor?: (user_id: string) => string,
): Promise<void> {
  // Built once: every recipient of one notice gets the same bag, and a gig
  // with a thousand subscribers should not allocate a thousand copies.
  const data = escrowPushData(escrow_id, kind)
  // Title/body named rather than spread: callers pass wider objects (the party
  // notice carries `recipient`), and a spread would put that in the job input
  // where nothing expects it.
  await enqueueNotificationToMany(queue, user_ids, {
    title: notice.title,
    body: notice.body,
    data,
    ...(idFor !== undefined ? { idFor } : {}),
  })
}
