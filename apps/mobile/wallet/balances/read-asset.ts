import type { ChainRegistryEntry } from '@tenda/shared'
import { READERS } from './readers'
import type { AssetBalance } from './types'

/**
 * ONE asset's balance on ONE chain — the targeted counterpart to
 * `readWalletBalances`' fan-out. Costs a single RPC (the reader's `assetIds`
 * filter), which is what makes it usable as a blocking pre-flight before a
 * transaction rather than only as screen furniture.
 *
 * Returns null when the balance is UNKNOWN — the asset isn't on this chain,
 * or the read failed/timed out. Callers must not read null as "zero": the two
 * are opposite outcomes and conflating them would block a funded user. The
 * reader's own timeout bounds this; it never hangs.
 */
export async function readAssetBalance(
  address: string,
  chain: ChainRegistryEntry,
  assetId: string,
): Promise<AssetBalance | null> {
  const balances = await READERS[chain.namespace].read(address, chain, [assetId])
  return balances.find((b) => b.assetId === assetId) ?? null
}
