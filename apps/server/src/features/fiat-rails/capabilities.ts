/**
 * p2p_internal capability surface — derived ONCE from the manifest + payout
 * country specs so the routed provider (buildProviders) and the descriptive
 * `fiat_providers` seed row (admin-visible) can never disagree. New chains,
 * assets, or payout markets flow through automatically; nothing is hardcoded.
 */

import { CHAIN_MANIFEST, exchangeAssetsByChain, PAYOUT_CURRENCIES } from '@tenda/shared'
import type { ProviderCapabilities } from './types'

/** Every exchange-tradable asset id across all chains (USDC + natives), deduped. */
export const EXCHANGE_ASSET_IDS: string[] = [
  ...new Set(CHAIN_MANIFEST.flatMap((c) => exchangeAssetsByChain(c.id))),
]

/** The always-on internal P2P provider's capabilities. */
export const P2P_INTERNAL_CAPABILITIES: ProviderCapabilities = {
  // CO4: onramp quotes against live sell offers; offramp opens a fresh offer.
  onramp: true,
  offramp: true,
  // Launch payout currencies + the full exchange-tradable asset set.
  currencies: PAYOUT_CURRENCIES,
  assets: EXCHANGE_ASSET_IDS,
}
