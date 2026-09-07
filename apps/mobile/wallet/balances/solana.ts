import { PublicKey } from '@solana/web3.js'
import { withTimeout, type ChainRegistryEntry } from '@tenda/shared'
import { getBalance, getSplTokenBalance } from '@/wallet'
import type { AssetBalance, BalanceReader } from './types'
import { selectAssets } from './select-assets'
import { BALANCE_RPC_TIMEOUT_MS } from './constants'

export const solanaBalanceReader: BalanceReader = {
  async read(
    address: string,
    chain: ChainRegistryEntry,
    assetIds?: readonly string[],
  ): Promise<AssetBalance[]> {
    let owner: PublicKey
    try {
      owner = new PublicKey(address)
    } catch {
      return [] // Malformed address, nothing to read.
    }

    const results = await Promise.allSettled(
      selectAssets(chain, assetIds).map(async (asset): Promise<AssetBalance> => {
        // Bound each RPC so a hung endpoint can't strand the wallet screen.
        const amountRaw =
          asset.token_address === null
            ? String(await withTimeout(getBalance(owner), BALANCE_RPC_TIMEOUT_MS)) // native SOL, in lamports
            : await withTimeout(
                getSplTokenBalance(owner, new PublicKey(asset.token_address)),
                BALANCE_RPC_TIMEOUT_MS,
              )
        return {
          assetId: asset.id,
          symbol: asset.symbol,
          amountRaw,
          decimals: asset.decimals,
          isStable: asset.is_stable,
        }
      }),
    )
    return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  },
}
