/**
 * Wallet-screen balance fan-out (moved from apps/mobile/wallet/balances/
 * index.ts, 2026-08-15, parameterized on the reader registry): read every
 * linked wallet's USDC + native balance across the enabled chains matching
 * its namespace. `DEFAULT_READERS` are the shared fetch-based ones; a client
 * with its own transport (mobile's web3.js Solana reader) injects overrides
 * — the pluggable-reader requirement, unchanged.
 */
import type { ChainNamespace } from '../../db/schema/chains'
import type { ChainRegistryEntry } from '../../api/contracts/platform.contract'
import type { AssetBalance, BalanceReader, WalletChainBalance } from './types'
import { evmBalanceReader } from './evm-reader'
import { solanaBalanceReader } from './solana-reader'

export const DEFAULT_READERS: Record<ChainNamespace, BalanceReader> = {
  solana: solanaBalanceReader,
  eip155: evmBalanceReader,
}

/** The chain's gig stablecoin (USDC) balance from a read result, if present. */
function pickUsdc(balances: AssetBalance[], chain: ChainRegistryEntry): AssetBalance | null {
  const usdcId = chain.assets.find((a) => a.symbol === 'USDC')?.id
  return balances.find((b) => b.assetId === usdcId) ?? null
}

/** The chain's native gas token (token_address === null) balance, if present. */
function pickNative(balances: AssetBalance[], chain: ChainRegistryEntry): AssetBalance | null {
  const nativeId = chain.assets.find((a) => a.token_address === null)?.id
  return balances.find((b) => b.assetId === nativeId) ?? null
}

/**
 * Read every (wallet × matching chain) pair — an EVM address can hold USDC on
 * several EVM chains. `allSettled` so one chain's RPC failure never sinks the
 * whole screen.
 */
export async function readWalletBalances(
  wallets: readonly { chain_ns: ChainNamespace; address: string }[],
  chains: readonly ChainRegistryEntry[],
  readers: Record<ChainNamespace, BalanceReader> = DEFAULT_READERS,
): Promise<WalletChainBalance[]> {
  const pairs = wallets.flatMap((wallet) =>
    chains.filter((c) => c.namespace === wallet.chain_ns).map((chain) => ({ wallet, chain })),
  )

  const settled = await Promise.allSettled(
    pairs.map(async ({ wallet, chain }): Promise<WalletChainBalance> => {
      const balances = await readers[chain.namespace].read(wallet.address, chain)
      return {
        chainId: chain.id,
        namespace: chain.namespace,
        displayName: chain.display_name,
        address: wallet.address,
        usdc: pickUsdc(balances, chain),
        native: pickNative(balances, chain),
      }
    }),
  )
  return settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}

/**
 * Sum of USDC across all (wallet, chain) results, in base units. Exact integer
 * math, valid because every USDC has the same 6 decimals (ASSET_META), so base
 * units are directly summable. The caller formats with USDC's decimals.
 */
export function sumUsdcRaw(balances: readonly WalletChainBalance[]): string {
  return balances
    .reduce((sum, b) => sum + (b.usdc ? BigInt(b.usdc.amountRaw) : 0n), 0n)
    .toString()
}
