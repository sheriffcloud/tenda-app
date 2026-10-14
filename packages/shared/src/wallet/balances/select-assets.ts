import type { ChainRegistryEntry } from '../../api/contracts/platform.contract'

type RegistryAsset = ChainRegistryEntry['assets'][number]

/**
 * The assets a reader should fetch for one chain. `assetIds` undefined means
 * "every asset on the chain" (the wallet screen's fan-out); a filter narrows
 * it to just the ones asked for, so a targeted read (the sufficiency
 * pre-flight) costs ONE RPC instead of one per asset on the chain.
 *
 * Shared by every reader so the filter semantics can't drift per namespace.
 * Ids that don't exist on the chain are simply absent from the result — the
 * caller distinguishes "unknown asset" from "zero balance" by the read
 * returning no entry for it.
 */
export function selectAssets(
  chain: ChainRegistryEntry,
  assetIds?: readonly string[],
): RegistryAsset[] {
  if (assetIds === undefined) return [...chain.assets]
  const wanted = new Set(assetIds)
  return chain.assets.filter((a) => wanted.has(a.id))
}
