/**
 * Reconcile stuck fiat intents (stage-8 § Reconciliation). Repeatable
 * BullMQ job (every 5min, wired with #33): polls provider.status() for
 * open intents that haven't moved in RECONCILE_MIN_AGE_MS and converges
 * them; providers with no record past 24h fail the intent (provider SOP
 * handles the fiat refund).
 */

import { RECONCILE_BATCH_LIMIT, RECONCILE_MIN_AGE_MS } from '@server/features/fiat-rails/config'
import { reconcileIntent, type FiatDeps } from '@server/features/fiat-rails/service'

export interface ReconcileFiatResult {
  scanned: number
}

export async function reconcileFiatIntentsHandler(deps: FiatDeps): Promise<ReconcileFiatResult> {
  const olderThan = new Date(deps.now().getTime() - RECONCILE_MIN_AGE_MS)
  const stale = await deps.store.listStaleOpen(olderThan, RECONCILE_BATCH_LIMIT)
  for (const intent of stale) {
    // Per-intent isolation: one provider hiccup must not stall the batch.
    try {
      await reconcileIntent(deps, intent)
    } catch (err) {
      deps.log.warn({ err, intent_id: intent.id }, 'fiat reconcile: intent failed, continuing')
    }
  }
  return { scanned: stale.length }
}
