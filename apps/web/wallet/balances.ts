/**
 * Web balances binding — twin of apps/mobile/wallet/balances/index.ts. The
 * pre-flight trio (readAssetBalance / readSpendableBalance /
 * ensureSufficientBalanceOn) lives in @tenda/shared; the one platform-bound
 * line here resolves the chain entry from THIS client's registry store.
 */
import { ensureSufficientBalanceOn } from '@tenda/shared'
import { selectChainById, useChainRegistryStore } from '@/stores/chain-registry.store'

/**
 * Shared `ensureSufficientBalanceOn` with the chain resolved from this
 * client's registry. An unknown/unloaded chain falls open inside the shared
 * check (null chain), preserving the fail-open doctrine end to end.
 */
export async function ensureSufficientBalance(args: {
  chainId: string
  assetId: string
  amountRaw: string
  owners: readonly string[]
}): Promise<void> {
  const chain = selectChainById(useChainRegistryStore.getState().chains, args.chainId)
  return ensureSufficientBalanceOn(chain, args)
}
