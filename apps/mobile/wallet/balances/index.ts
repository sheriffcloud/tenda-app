/**
 * Mobile balances binding. The readers, fan-out, targeted read, spendable
 * maximum and the sufficiency pre-flight ALL live in @tenda/shared now (the
 * pre-flight trio moved 2026-08-15). What remains here is the one
 * platform-bound line: resolving the chain entry from mobile's registry
 * store before delegating to the shared check.
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
