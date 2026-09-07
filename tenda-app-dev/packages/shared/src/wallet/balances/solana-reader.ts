/**
 * Solana balance reader — pure fetch JSON-RPC, no @solana/web3.js. Written
 * for the web client (2026-08-15); mobile still runs its Connection-based
 * reader (device-verified) and injects it into `readWalletBalances` —
 * converging mobile onto this one is a flagged follow-up, not a silent swap.
 *
 * Wire shapes: `getBalance` answers { value: lamports }, and
 * `getTokenAccountsByOwner` (jsonParsed) answers { value: [{ account: {
 * data: { parsed: { info: { tokenAmount: { amount } } } } } }] }, summed
 * across the owner's token accounts for the mint (mirrors mobile's
 * getSplTokenBalance).
 */
import { solanaPublicRpcUrl } from '../../constants/solana'
import { withTimeout } from '../../utils/async'
import type { ChainRegistryEntry } from '../../api/contracts/platform.contract'
import type { AssetBalance, BalanceReader } from './types'
import { selectAssets } from './select-assets'
import { BALANCE_RPC_TIMEOUT_MS } from './constants'

interface RpcEnvelope {
  result?: { value?: unknown }
}

async function solanaRpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body: unknown = await res.json()
  return typeof body === 'object' && body !== null ? (body as RpcEnvelope).result?.value : undefined
}

/**
 * 'confirmed', explicitly: raw JSON-RPC defaults to 'finalized', but mobile's
 * web3.js Connection has always read at 'confirmed' — a freshly-settled
 * payment must show up in the balance within a slot or two on every client,
 * not ~30s later on one of them.
 */
const COMMITMENT = { commitment: 'confirmed' }

async function lamportsOf(rpcUrl: string, address: string): Promise<string> {
  const value = await solanaRpc(rpcUrl, 'getBalance', [address, COMMITMENT])
  if (typeof value !== 'number') throw new Error('getBalance: no numeric value')
  return String(value)
}

interface ParsedTokenAccount {
  account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } }
}

async function splBalanceOf(rpcUrl: string, owner: string, mint: string): Promise<string> {
  const value = await solanaRpc(rpcUrl, 'getTokenAccountsByOwner', [
    owner,
    { mint },
    { encoding: 'jsonParsed', ...COMMITMENT },
  ])
  if (!Array.isArray(value)) throw new Error('getTokenAccountsByOwner: no account list')
  let total = 0n
  for (const entry of value as ParsedTokenAccount[]) {
    const amount = entry.account?.data?.parsed?.info?.tokenAmount?.amount
    if (typeof amount === 'string') total += BigInt(amount)
  }
  return total.toString()
}

export const solanaBalanceReader: BalanceReader = {
  async read(
    address: string,
    chain: ChainRegistryEntry,
    assetIds?: readonly string[],
  ): Promise<AssetBalance[]> {
    const rpcUrl = solanaPublicRpcUrl(chain.id)
    if (rpcUrl === null) return []

    const results = await Promise.allSettled(
      selectAssets(chain, assetIds).map(async (asset): Promise<AssetBalance> => {
        // Bound each RPC so a hung endpoint can't strand the wallet screen.
        const amountRaw =
          asset.token_address === null
            ? await withTimeout(lamportsOf(rpcUrl, address), BALANCE_RPC_TIMEOUT_MS)
            : await withTimeout(
                splBalanceOf(rpcUrl, address, asset.token_address),
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
    // A malformed address / failed asset read omits that asset, never throws.
    return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  },
}
