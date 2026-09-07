'use client'

/**
 * Web port of apps/mobile/hooks/useExchangeAssetOptions.ts: the
 * exchange-tradable assets (from the shared manifest queries) the user
 * can actually sell — i.e. on a chain whose namespace they have a
 * VERIFIED linked wallet for. Web has no persistent session address (the
 * live connection belongs to the adapter), so resolution runs over the
 * linked list alone — the same `pickWalletAddress` dispatch signs with.
 *
 * It returns WHY the list is empty as well as the list (#60). The filtering
 * above means an empty result is the surface's whole message, and it had four
 * causes with one rendering — so the cause is resolved here, once, by the same
 * `resolveWalletSection` the wallet screen uses.
 */
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

export interface ExchangeAssetOption {
  chainId: string
  assetId: string
  symbol: string
  decimals: number
  chainName: string
  walletAddress: string
}

export interface ExchangeAssetOptions {
  options: ExchangeAssetOption[]
  /** Why `options` is empty, or 'ready' when it is not. */
  section: WalletSectionState
}

export function useExchangeAssetOptions(): ExchangeAssetOptions {
  const chains = useChainRegistryStore((s) => s.chains)
  const chainsStatus = useChainRegistryStore((s) => s.status)
  const ensureLoaded = useChainRegistryStore((s) => s.ensureLoaded)
  const wallets = useAuthStore((s) => s.wallets)
  const walletsStatus = useAuthStore((s) => s.walletsStatus)
  const ensureWallets = useAuthStore((s) => s.ensureWallets)

  // This hook's answer depends on BOTH the chain registry and the linked
  // wallets, so it loads both rather than waiting for a neighbour to.
  // Measured: the sell surface has neither a chain-chip row nor the wallet
  // screen's loader, so its options stayed empty forever and the page told a
  // reader with a linked wallet to link one. Both ensures de-dupe, so the
  // surfaces that already load them are unaffected.
  useEffect(() => {
    void ensureLoaded()
    void ensureWallets()
  }, [ensureLoaded, ensureWallets])

  const options = useMemo(() => {
    if (chains === null) return []
    const built: ExchangeAssetOption[] = []
    for (const chain of chains) {
      const walletAddress = pickWalletAddress(chain.namespace, null, wallets)
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
  }, [chains, wallets])

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
