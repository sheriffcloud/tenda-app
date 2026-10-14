'use client'

/**
 * Asset/chain selection shared by both sell tabs: the tradable options the
 * reader has a VERIFIED wallet for, plus the current pick.
 *
 * Defaults to the first option and re-resolves when the option set changes —
 * a wallet linked or unlinked mid-session must not leave the panel pointing at
 * an option that is no longer there.
 */
import { useMemo, useState } from 'react'
import type { WalletSectionState } from '@tenda/shared'
import {
  useExchangeAssetOptions,
  type ExchangeAssetOption,
} from '@/hooks/exchange/useExchangeAssetOptions'

/** Identity of an option: one asset on one chain, held by one wallet. */
export function assetOptionKey(option: ExchangeAssetOption): string {
  return `${option.chainId}:${option.assetId}:${option.walletAddress}`
}

export interface AssetSelection {
  options: ExchangeAssetOption[]
  /** Why `options` is empty (#60) — the surface must say which. */
  section: WalletSectionState
  /** The chosen option, defaulting to the first available; null when none. */
  option: ExchangeAssetOption | null
  selectedKey: string
  select: (option: ExchangeAssetOption) => void
}

export function useAssetSelection(): AssetSelection {
  const { options, section } = useExchangeAssetOptions()
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const option = useMemo(
    () => options.find((o) => assetOptionKey(o) === pickedKey) ?? options[0] ?? null,
    [options, pickedKey],
  )
  return {
    options,
    section,
    option,
    selectedKey: option !== null ? assetOptionKey(option) : '',
    select: (o) => setPickedKey(assetOptionKey(o)),
  }
}
