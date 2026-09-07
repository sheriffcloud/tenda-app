/**
 * Settlement: apply provider-side outcomes (webhooks) and reconcile stale open
 * intents (the cron poll). All transitions ride the store's status-guarded
 * `transition()`, so replays/races can't regress a terminal row.
 */

import { RECONCILE_GIVE_UP_MS } from '../config'
import type { FiatIntentRow, FiatProvider } from '../types'
import { toEvent, type FiatDeps } from './deps'

export type ProviderOutcome = 'completed' | 'failed'

/**
 * Apply a provider-side outcome. Idempotent: replays miss the status guard and
 * return the row unchanged. Returns the intent or null when no row matches the
 * (provider, provider_ref) pair, webhooks for unknown refs are logged and
 * dropped (cross-provider ref confusion / spam).
 */
export async function settleFromProvider(
  deps: FiatDeps,
  args: { provider: string; provider_ref: string; outcome: ProviderOutcome; reason?: string },
): Promise<FiatIntentRow | null> {
  const intent = await deps.store.getIntentByProviderRef(args.provider, args.provider_ref)
  if (intent === null) {
    deps.log.warn(
      { provider: args.provider, provider_ref: args.provider_ref },
      'fiat: settlement for unknown provider_ref dropped',
    )
    return null
  }
  if (intent.status === 'settled' || intent.status === 'failed' || intent.status === 'cancelled') {
    return intent // replay, already terminal
  }

  if (args.outcome === 'completed') {
    const updated = await deps.store.transition(
      intent.id,
      ['awaiting_user', 'awaiting_provider', 'settling'],
      { status: 'settled' },
    )
    if (updated !== null) deps.events.settled(toEvent(updated))
    return updated ?? intent
  }

  const updated = await deps.store.transition(
    intent.id,
    ['quoted', 'awaiting_user', 'awaiting_provider', 'settling'],
    { status: 'failed' },
  )
  if (updated !== null) {
    deps.events.failed({ ...toEvent(updated), reason: args.reason ?? 'provider reported failure' })
  }
  return updated ?? intent
}

/**
 * Reconcile one stale open intent (§ Reconciliation): poll the provider and
 * converge. Intents the provider has no record of past the give-up window are
 * failed; younger unknown refs stay pending (provider lag).
 */
export async function reconcileIntent(deps: FiatDeps, intent: FiatIntentRow): Promise<void> {
  // Never initiated (no provider_ref): nothing to poll. Quote expiry is the
  // expire-quotes job's business; leave it alone here.
  if (intent.provider_ref === null) return

  const provider = deps.providers.get(intent.provider)
  if (provider === undefined) {
    deps.log.warn({ intent_id: intent.id, provider: intent.provider }, 'fiat: provider missing during reconcile')
    return
  }

  let status: Awaited<ReturnType<FiatProvider['status']>>
  try {
    status = await provider.status(intent.provider_ref, {
      user_id: intent.user_id,
      direction: intent.direction,
    })
  } catch (err) {
    deps.log.warn({ err, intent_id: intent.id }, 'fiat: provider status poll failed')
    return
  }

  if (status === 'completed' || status === 'failed') {
    await settleFromProvider(deps, {
      provider: intent.provider,
      provider_ref: intent.provider_ref,
      outcome: status,
      reason: status === 'failed' ? 'provider reported failure on reconcile' : undefined,
    })
    return
  }
  if (status === 'not_found') {
    const age = deps.now().getTime() - intent.created_at.getTime()
    if (age > RECONCILE_GIVE_UP_MS) {
      await settleFromProvider(deps, {
        provider: intent.provider,
        provider_ref: intent.provider_ref,
        outcome: 'failed',
        reason: 'provider has no record after 24h',
      })
    }
  }
  // 'pending' → leave for the next tick.
}
