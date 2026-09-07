/**
 * ONE asset's balance on ONE chain — the targeted counterpart to
 * `readWalletBalances`' fan-out (moved from apps/mobile/wallet/balances/
 * read-asset.ts 2026-08-15). Costs a single RPC (the reader's `assetIds`
 * filter), which is what makes it usable as a blocking pre-flight before a
 * transaction rather than only as screen furniture.
 *
 * Returns null when the balance is UNKNOWN — the asset isn't on this chain,
 * or the read failed/timed out. Callers must not read null as "zero": the two
 * are opposite outcomes and conflating them would block a funded user. The
 * reader's own timeout bounds this; it never hangs.
 */
import type { ChainNamespace } from '../../db/schema/chains'
import { DEFAULT_READERS } from './read'
import type { AssetBalance, BalanceReader } from './types'
import type { ChainRegistryEntry } from '../../api/contracts/platform.contract'

export async function readAssetBalance(
  address: string,
  chain: ChainRegistryEntry,
  assetId: string,
  readers: Record<ChainNamespace, BalanceReader> = DEFAULT_READERS,
): Promise<AssetBalance | null> {
  const balances = await readers[chain.namespace].read(address, chain, [assetId])
  return balances.find((b) => b.assetId === assetId) ?? null
}
