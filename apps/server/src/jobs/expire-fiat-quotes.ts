/**
 * Expire stale fiat intents (stage-8 § jobs). Repeatable BullMQ job (#33):
 * awaiting_user intents (licensed-provider deposit instructions) past their
 * quote validity transition to 'failed'. Pre-commit quotes are no longer
 * Postgres rows — they expire via the Redis quote-cache TTL — so this job now
 * only sweeps committed awaiting_user rows.
 *
 * NOTE: awaiting_user intents that expire are FAILED, not silently
 * retried, the provider re-quotes on late settlement per the stage-8
 * risk table (never honor an expired quote at the original rate).
 */

import { RECONCILE_BATCH_LIMIT } from '@server/features/fiat-rails/config'
import type { FiatDeps } from '@server/features/fiat-rails/service'

export interface ExpireFiatQuotesResult {
  expired: number
}

export async function expireFiatQuotesHandler(deps: FiatDeps): Promise<ExpireFiatQuotesResult> {
  const now = deps.now()
  const stale = await deps.store.listExpiredAwaitingUser(now, RECONCILE_BATCH_LIMIT)
  let expired = 0
  for (const intent of stale) {
    const updated = await deps.store.transition(intent.id, ['awaiting_user'], {
      status: 'failed',
    })
    if (updated !== null) {
      expired += 1
      // awaiting_user rows are always initiated (they carry a provider_ref and
      // the user saw an instruction), so this notifies. The null-guard is pure
      // defence now that abandoned pre-commit quotes never reach this job —
      // they expire silently via the Redis cache TTL.
      if (updated.provider_ref !== null) {
        deps.events.failed({
          intent_id: updated.id,
          user_id: updated.user_id,
          direction: updated.direction,
          fiat_currency: updated.fiat_currency,
          fiat_amount: updated.fiat_amount,
          asset: updated.asset,
          asset_amount_raw: updated.asset_amount_raw,
          reason: 'quote expired',
        })
      }
    }
  }
  return { expired }
}
