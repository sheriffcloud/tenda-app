import { useEffect, useMemo } from 'react'
import {
  exchangeAssetsByChain,
  isRegistryUsable,
  pickWalletAddress,
  sellWalletSection,
  type WalletSectionState,
} from '@tenda/shared'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { useAuthStore } from '@/stores/auth.store'

/** One sellable (chain, asset) pair the user has a wallet for. */
export interface ExchangeAssetOption {
  chainId: string
  assetId: string
  symbol: string
  decimals: number
  chainName: string
  /** The user's wallet address on this chain (quote/escrow creator). */
  walletAddress: string
}

export interface ExchangeAssetOptions {
  options: ExchangeAssetOption[]
  /** Why `options` is empty, or 'ready' when it is not (#60). */
  section: WalletSectionState
}

/**
 * The exchange-tradable assets (USDC + native per chain, from the shared
 * manifest) that the user can actually sell — i.e. on a chain whose namespace
 * they have a VERIFIED linked wallet for. The address resolves from `wallets[]`
 * (the source of trust) via pickWalletAddress — the same resolution dispatch
 * signs with, so the quote/creator address can't diverge from the signer — with
 * the live session address preferred only when it's still linked. A chain with
 * no verified wallet is omitted.
 *
 * It returns WHY the list is empty as well as the list (#60), and it LOADS the
 * two things that answer that. The sell screen loads neither, so a cold
 * deep-link to /wallet/buy-sell left both empty and the surface told a reader
 * with a linked wallet to link one — permanently. Web's twin already carried
 * both loads for exactly this reason.
 */
export function useExchangeAssetOptions(): ExchangeAssetOptions {
  const chains = useChainRegistryStore((s) => s.chains)
  const chainsStatus = useChainRegistryStore((s) => s.status)
  const ensureLoaded = useChainRegistryStore((s) => s.ensureLoaded)
  const solAddress = useAuthStore((s) => s.walletAddress)
  const evmAddress = useAuthStore((s) => s.evmAddress)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const refreshMe = useAuthStore((s) => s.refreshMe)

  // Same guarded pair the composer uses: ensureLoaded de-dupes itself, and
  // `refreshMe` does NOT, so the status check is what stops every visit to the
  // sell screen refetching the account.
  useEffect(() => {
    void ensureLoaded()
    if (useAuthStore.getState().walletsStatus !== 'ready') void refreshMe()
  }, [ensureLoaded, refreshMe])

  const options = useMemo(() => {
    if (chains === null) return []
    const built: ExchangeAssetOption[] = []
    for (const chain of chains) {
      const session = chain.namespace === 'solana' ? solAddress : evmAddress
      const walletAddress = pickWalletAddress(chain.namespace, session, wallets)
      if (walletAddress === null) continue
      const eligible = new Set(exchangeAssetsByChain(chain.id))
      for (const asset of chain.assets) {
        if (!eligible.has(asset.id)) continue
        built.push({
          chainId: chain.id,
          assetId: asset.id,
          symbol: asset.symbol,
          decimals: asset.decimals,
          chainName: chain.display_name,
          walletAddress,
        })
      }
    }
    return built
  }, [chains, solAddress, evmAddress, wallets])

  return {
    options,
    // The sell surface's OWN precedence: the registry is asked about first,
    // because an empty list with no chains behind it says nothing about the
    // reader's wallets. Passing this through the wallet screen's ordering
    // instead answered `no-wallet` for a reader who had one.
    section: sellWalletSection({
      walletsStatus,
      chainsStatus,
      registryUsable: isRegistryUsable(chains),
      hasTradableOption: options.length > 0,
    }),
  }
}
