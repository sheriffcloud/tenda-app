/**
 * EVM balance reader — pure fetch JSON-RPC (moved from apps/mobile/wallet/
 * balances/evm.ts, 2026-08-15; both clients consume this one).
 */
import { evmPublicRpcUrl } from '../../chains/manifest-queries'
import { withTimeout } from '../../utils/async'
import type { ChainRegistryEntry } from '../../api/contracts/platform.contract'
import type { AssetBalance, BalanceReader } from './types'
import { selectAssets } from './select-assets'
import { BALANCE_RPC_TIMEOUT_MS } from './constants'
import { addressWord, evmRpcString, hexToDecimalString } from '../evm-rpc'

/** ERC-20 `balanceOf(address)` selector. */
const BALANCE_OF_SELECTOR = '0x70a08231'

/**
 * The node's answer, or a throw — never a manufactured zero.
 *
 * `evmRpcString` returns null for every shape that is not a string `result`:
 * an HTTP 200 carrying a JSON-RPC error object (rate limit, node error), a
 * body with no `result` key at all, a non-string result. None of those is an
 * exception, so without this the read would fulfil and the asset would arrive
 * carrying `hexToDecimalString(null)` — '0'.
 *
 * `'0x'` is the same class of non-answer one level down: an `eth_call` returns
 * it when the call reverted or the address holds no code, which is the token
 * contract declining to answer rather than a balance of nothing. A genuinely
 * empty account answers `0x0`, which parses to '0' and is a real reading.
 *
 * Throwing puts the asset on the rejected side of the caller's allSettled, so
 * it is OMITTED — which is what every layer above already expects: readAsset-
 * Balance turns a missing asset into null, readSpendableBalance turns null
 * into UNKNOWN, and the sufficiency pre-flight falls open on unknown rather
 * than telling a funded user they are short. The wallet grid renders its
 * em-dash for the same reason. This is the Solana reader's shape too, where
 * lamportsOf and splBalanceOf already throw on a missing value (#64).
 */
function quantityOrThrow(hex: string | null, method: string): string {
  if (hex === null || hex === '0x') {
    throw new Error(`${method}: no answer from the node`)
  }
  return hexToDecimalString(hex)
}

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
            ? quantityOrThrow(
                await withTimeout(
                  evmRpcString(rpcUrl, 'eth_getBalance', [address, 'latest']),
                  BALANCE_RPC_TIMEOUT_MS,
                ),
                'eth_getBalance',
              )
            : quantityOrThrow(
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
                'eth_call',
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
