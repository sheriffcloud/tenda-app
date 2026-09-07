import { useMemo, useState } from 'react'
import { useExchangeAssetOptions, type ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'
import { optionKey } from '@/components/exchange/AssetChainPicker'

export interface AssetSelection {
  options: ExchangeAssetOption[]
  /** The chosen option, defaulting to the first available; null when none. */
  option: ExchangeAssetOption | null
  selectedKey: string
  select: (option: ExchangeAssetOption) => void
}

/**
 * Asset/chain selection shared by both sell tabs: the tradable options the user
 * has a verified wallet for (from useExchangeAssetOptions) plus the current
 * pick, defaulting to the first. Falls back gracefully as the option set
 * changes (e.g. a wallet is linked/unlinked mid-session).
 */
export function useAssetSelection(): AssetSelection {
  const options = useExchangeAssetOptions()
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const option = useMemo(
    () => options.find((o) => optionKey(o) === pickedKey) ?? options[0] ?? null,
    [options, pickedKey],
  )
  return {
    options,
    option,
    selectedKey: option !== null ? optionKey(option) : '',
    select: (o) => setPickedKey(optionKey(o)),
  }
}
