/**
 * Provider routing (stage-8 § Provider routing): enabled + capable
 * providers in priority order; p2p_internal is appended as the
 * unconditional fallback so a licensed-provider outage never blocks the
 * user. The caller (service) walks the candidate list, a provider that
 * throws simply yields to the next.
 */

import { P2P_INTERNAL_ID } from './config'
import type { FiatProvider, QuoteRequest } from './types'

/** Enable/priority row, mirrors the fiat_providers table. */
export interface ProviderRegistryRow {
  id: string
  priority: number
  is_enabled: boolean
}

/** Routing only reads capability-relevant fields, user identity is not one. */
export type RoutingRequest = Pick<QuoteRequest, 'direction' | 'fiat_currency' | 'asset'>

export function supportsRequest(provider: FiatProvider, req: RoutingRequest): boolean {
  const caps = provider.capabilities
  if (req.direction === 'onramp' && !caps.onramp) return false
  if (req.direction === 'offramp' && !caps.offramp) return false
  if (!caps.currencies.includes(req.fiat_currency)) return false
  if (!caps.assets.includes('*') && !caps.assets.includes(req.asset)) return false
  return true
}

export function pickCandidates(
  registry: ProviderRegistryRow[],
  providers: Map<string, FiatProvider>,
  req: RoutingRequest,
): FiatProvider[] {
  const byId = new Map(registry.map((r) => [r.id, r]))

  const licensed = [...providers.values()]
    .filter((p) => p.id !== P2P_INTERNAL_ID)
    .filter((p) => byId.get(p.id)?.is_enabled ?? false)
    .filter((p) => supportsRequest(p, req))
    .sort(
      (a, b) => (byId.get(a.id)?.priority ?? 100) - (byId.get(b.id)?.priority ?? 100),
    )

  const fallback = providers.get(P2P_INTERNAL_ID)
  const p2pEnabled = byId.get(P2P_INTERNAL_ID)?.is_enabled ?? true
  if (fallback !== undefined && p2pEnabled && supportsRequest(fallback, req)) {
    return [...licensed, fallback]
  }
  return licensed
}
