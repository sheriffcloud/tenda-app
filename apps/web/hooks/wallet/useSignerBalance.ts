'use client'

/**
 * Can the PREVIEWED signer cover what a transaction is about to debit? The
 * shared pre-flight (`ensureSufficientBalanceOn`) deliberately passes when
 * ANY linked wallet can pay — the signer isn't fixed until the wallet opens —
 * so a short signer sails through it and the transfer reverts on-chain. The
 * confirm dialog previews the exact signer, which narrows the question to
 * one address: a shortfall surfaced there is fixable BEFORE signing (switch
 * wallet, or top up) instead of after a revert.
 *
 * Same fail-open doctrine as every balance read: only a positively-read
 * shortfall answers 'short'. Unknown chain, unresolved signer, unreadable
 * balance, unparseable amount — all answer 'unknown', and consumers must
 * stay silent on 'unknown' (the chain remains the authority; this is a
 * warning, never a block).
 */
import { useEffect } from 'react'
import { toBigIntOrNull } from '@tenda/shared'
import { useSpendableBalance } from '@/hooks/wallet/useSpendableBalance'
import { useChainRegistryStore } from '@/stores/chain-registry.store'

/** What the pending action will debit from the signer, in base units. */
export interface SpendPreview {
  assetId: string
  amountRaw: string
}

export interface SignerBalance {
  /** 'short' is the only state a UI acts on; everything else is silence. */
  funds: 'unknown' | 'ok' | 'short'
  /** Base units the signer holds — set only when funds is 'ok' | 'short'. */
  availableRaw: string | null
}

const UNKNOWN: SignerBalance = { funds: 'unknown', availableRaw: null }

export function useSignerBalance(
  chainId: string,
  /** null = this action moves no value; the hook is inert (no RPC). */
  spend: SpendPreview | null,
  /** The previewed signer (useSigningWallet.address); null = unresolved. */
  address: string | null,
): SignerBalance {
  const ensureLoaded = useChainRegistryStore((s) => s.ensureLoaded)
  const active = spend !== null && address !== null

  // The detail screens don't load the registry until a tx is dispatched — by
  // then this dialog is gone — so the read arms the registry itself.
  useEffect(() => {
    if (active) void ensureLoaded()
  }, [active, ensureLoaded])

  const { balance, status } = useSpendableBalance(
    chainId,
    spend?.assetId ?? '',
    active ? address : null,
  )

  if (spend === null || address === null || status !== 'ready' || balance === null) return UNKNOWN

  // BigInt-exact: base units exceed Number.MAX_SAFE_INTEGER on 18-decimal
  // assets, so a numeric compare would silently mis-answer.
  const required = toBigIntOrNull(spend.amountRaw)
  const available = toBigIntOrNull(balance.amountRaw)
  if (required === null || required <= BigInt(0) || available === null) return UNKNOWN

  return { funds: available < required ? 'short' : 'ok', availableRaw: balance.amountRaw }
}
