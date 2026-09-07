import { evmPublicRpcUrl, withTimeout, type ChainRegistryEntry } from '@tenda/shared'
import type { AssetBalance, BalanceReader } from './types'
import { selectAssets } from './select-assets'
import { BALANCE_RPC_TIMEOUT_MS } from './constants'
import { addressWord, evmRpcString, hexToDecimalString } from '../evm-rpc'

/** ERC-20 `balanceOf(address)` selector. */
const BALANCE_OF_SELECTOR = '0x70a08231'

export const evmBalanceReader: BalanceReader = {
  async read(
    address: string,
    chain: ChainRegistryEntry,
    assetIds?: readonly string[],
  ): Promise<AssetBalance[]> {
    const rpcUrl = evmPublicRpcUrl(chain.id)
    if (rpcUrl === null) return []

    const results = await Promise.allSettled(
      selectAssets(chain, assetIds).map(async (asset): Promise<AssetBalance> => {
        // Bound each RPC: allSettled only resolves once EVERY child settles,
        // so one hung endpoint would otherwise strand the caller (the wallet
        // screen on a skeleton, the sufficiency pre-flight before the wallet
        // opens). Matches the Solana reader.
        const amountRaw =
          asset.token_address === null
            ? hexToDecimalString(
                await withTimeout(
                  evmRpcString(rpcUrl, 'eth_getBalance', [address, 'latest']),
                  BALANCE_RPC_TIMEOUT_MS,
                ),
              )
            : hexToDecimalString(
                await withTimeout(
                  evmRpcString(rpcUrl, 'eth_call', [
                    {
                      to: asset.token_address,
                      data: `${BALANCE_OF_SELECTOR}${addressWord(address)}`,
                    },
                    'latest',
                  ]),
                  BALANCE_RPC_TIMEOUT_MS,
                ),
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
    // One failed asset read must not sink the others.
    return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  },
}
