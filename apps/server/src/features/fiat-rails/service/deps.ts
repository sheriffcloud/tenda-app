/**
 * Fiat-rails service dependency surface + the settlement event shapes. The DI
 * bundle (FiatDeps) is assembled live in ../index (buildFiatDeps) and injected
 * into every service operation (quote / intents / settlement).
 */

import type { ProviderRegistryRow } from '../routing'
import type { FiatStore } from '../store'
import type { QuoteCache } from '../quote-cache'
import type { FiatProvider, FiatIntentRow } from '../types'

export interface FiatEvent {
  intent_id: string
  user_id: string
  direction: 'onramp' | 'offramp'
  fiat_currency: string
  fiat_amount: string
  asset: string
  asset_amount_raw: string
}

export interface FiatEventSink {
  settled(e: FiatEvent): void
  failed(e: FiatEvent & { reason: string }): void
}

export interface FiatDeps {
  store: FiatStore
  /** Pre-commit price quotes (Redis in prod, in-memory in tests). */
  quoteCache: QuoteCache
  providers: Map<string, FiatProvider>
  /** Enable/priority rows (fiat_providers table). */
  registry: ProviderRegistryRow[]
  events: FiatEventSink
  now(): Date
  log: { warn(obj: Record<string, unknown>, msg: string): void }
}

export function toEvent(intent: FiatIntentRow): FiatEvent {
  return {
    intent_id: intent.id,
    user_id: intent.user_id,
    direction: intent.direction,
    fiat_currency: intent.fiat_currency,
    fiat_amount: intent.fiat_amount,
    asset: intent.asset,
    asset_amount_raw: intent.asset_amount_raw,
  }
}
