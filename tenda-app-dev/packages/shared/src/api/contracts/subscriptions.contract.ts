import type { Endpoint } from '../endpoint'
import type { GigSubscription, UpsertSubscriptionInput } from '../../types'

export interface SubscriptionsContract {
  list:   Endpoint<'GET',    undefined, undefined,                 undefined, GigSubscription[]>
  upsert: Endpoint<'POST',   undefined, UpsertSubscriptionInput,   undefined, GigSubscription>
  remove: Endpoint<'DELETE', { id: string }, undefined,            undefined, { ok: boolean }>
}
