import { findChain } from '@tenda/shared'

/**
 * Human label for a CAIP-2 chain id, sourced from the shared CHAIN_MANIFEST —
 * the single source of chain facts. Deriving the label from the manifest means
 * a newly-added chain surfaces its real name the moment it lands in the
 * manifest, with no display-code edit (no hardcoded per-chain list to drift).
 * Unknown ids fall back to 'Unknown' so a mis-seeded escrow can never crash a
 * render.
 */
export function chainLabel(chainId: string): string {
  return findChain(chainId)?.displayName ?? 'Unknown'
}
