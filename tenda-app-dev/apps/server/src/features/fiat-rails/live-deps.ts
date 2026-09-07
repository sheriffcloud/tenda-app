/**
 * `buildFiatDeps(fastify)` assembles the live dependency set:
 *  - p2p_internal: always present (drizzle order book + fulfilment).
 *  - yellowcard / onrampmoney: present only when their env credentials exist
 *    (#61), a missing key means the provider simply isn't offered.
 */

import type { FastifyInstance } from 'fastify'
import { fiat_providers } from '@tenda/shared/db/schema/fiat'
import { getConfig } from '@server/config'
import { appEvents } from '@server/lib/events'
import { P2P_INTERNAL_ID } from './config'
import { P2P_INTERNAL_CAPABILITIES } from './capabilities'
import { drizzleFiatStore } from './store'
import { p2pInternalProvider } from './providers/p2p-internal'
import { licensedHttpProvider, fetchProviderHttp } from './providers/licensed-http'
import { YELLOWCARD_SPEC, ONRAMPMONEY_SPEC } from './providers/specs'
import { drizzleP2pOrderBook, drizzleP2pFulfilment, assetRateSource } from './p2p-live'
import type { FiatDeps, FiatEventSink } from './service'
import type { FiatProvider } from './types'

function liveEventSink(): FiatEventSink {
  return {
    settled(e) {
      appEvents.emit('fiat.settled', e)
    },
    failed(e) {
      appEvents.emit('fiat.failed', e)
    },
  }
}

export function buildProviders(fastify: FastifyInstance): Map<string, FiatProvider> {
  const cfg = getConfig()
  const providers = new Map<string, FiatProvider>()

  providers.set(
    P2P_INTERNAL_ID,
    p2pInternalProvider({
      rates: assetRateSource(),
      book: drizzleP2pOrderBook(fastify),
      fulfilment: drizzleP2pFulfilment(fastify),
      // Single source, shared with the seed's descriptive registry row.
      capabilities: P2P_INTERNAL_CAPABILITIES,
      now: () => new Date(),
    }),
  )

  if (cfg.YELLOWCARD_API_KEY !== null && cfg.YELLOWCARD_API_SECRET !== null) {
    providers.set(
      YELLOWCARD_SPEC.id,
      licensedHttpProvider(
        YELLOWCARD_SPEC,
        { api_key: cfg.YELLOWCARD_API_KEY, api_secret: cfg.YELLOWCARD_API_SECRET },
        fetchProviderHttp(),
      ),
    )
  }
  if (cfg.ONRAMPMONEY_API_KEY !== null && cfg.ONRAMPMONEY_API_SECRET !== null) {
    providers.set(
      ONRAMPMONEY_SPEC.id,
      licensedHttpProvider(
        ONRAMPMONEY_SPEC,
        { api_key: cfg.ONRAMPMONEY_API_KEY, api_secret: cfg.ONRAMPMONEY_API_SECRET },
        fetchProviderHttp(),
      ),
    )
  }
  return providers
}

export async function buildFiatDeps(fastify: FastifyInstance): Promise<FiatDeps> {
  const registry = await fastify.db
    .select({
      id: fiat_providers.id,
      priority: fiat_providers.priority,
      is_enabled: fiat_providers.is_enabled,
    })
    .from(fiat_providers)

  return {
    store: drizzleFiatStore(fastify.db),
    quoteCache: fastify.quoteCache,
    providers: buildProviders(fastify),
    registry,
    events: liveEventSink(),
    now: () => new Date(),
    log: fastify.log,
  }
}
