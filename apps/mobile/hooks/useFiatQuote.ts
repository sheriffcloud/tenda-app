import { useEffect, useRef, useState } from 'react'
import type { FiatQuoteResponse } from '@tenda/shared'
import { api, ApiClientError } from '@/api/client'

const DEBOUNCE_MS = 600

export interface FiatQuoteState {
  quote: FiatQuoteResponse | null
  /** Seconds until the active quote expires (0 when none/expired). */
  expiresIn: number
  loading: boolean
  /** User-facing error ('unavailable' carries special copy). */
  error: 'unavailable' | 'failed' | null
  /** Re-runs the fetch with the same inputs (retry after failure/expiry). */
  refetch: () => void
}

export interface FiatQuoteInput {
  direction: 'onramp' | 'offramp'
  /** Asset registry id being traded (e.g. 'USDC_BASE', 'SOL_DEVNET'). */
  asset: string
  /** CAIP-2 chain the asset lives on. */
  chainId: string
  /** The seller's wallet address on that chain. */
  walletAddress: string
  /** ISO-4217 fiat currency (derived from the payout account's country). */
  fiatCurrency: string
  /** Onramp: fiat the user pays. */
  fiatAmount?: number
  /** Offramp: base units the user sells. */
  assetAmountRaw?: string
}

/**
 * Debounced fiat quote with an expiry countdown so the UI can prompt a
 * re-quote. Asset, chain, wallet, and currency are all supplied by the caller
 * (multi-asset, multi-currency) — nothing is hardcoded here.
 */
export function useFiatQuote(input: FiatQuoteInput | null): FiatQuoteState {
  const [state, setState] = useState<QuoteData>({ quote: null, expiresIn: 0, loading: false, error: null })
  const [nonce, setNonce] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const lastNonce = useRef(0)

  const direction = input?.direction ?? null
  const asset = input?.asset
  const chainId = input?.chainId
  const walletAddress = input?.walletAddress
  const fiatCurrency = input?.fiatCurrency
  const fiatAmount = input?.fiatAmount
  const assetAmountRaw = input?.assetAmountRaw

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const ready =
      direction !== null &&
      asset !== undefined &&
      chainId !== undefined &&
      walletAddress !== undefined &&
      fiatCurrency !== undefined &&
      (direction === 'onramp'
        ? fiatAmount !== undefined && fiatAmount > 0
        : assetAmountRaw !== undefined && assetAmountRaw !== '0' && assetAmountRaw !== '')
    if (!ready) {
      setState({ quote: null, expiresIn: 0, loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    // A manual refetch (nonce bump) fires immediately — the debounce only
    // exists to coalesce typing.
    const delay = nonce !== lastNonce.current ? 0 : DEBOUNCE_MS
    lastNonce.current = nonce
    timer.current = setTimeout(() => {
      const mySeq = ++seq.current
      api.fiat
        .quote({
          direction,
          fiat_currency: fiatCurrency,
          ...(direction === 'onramp' ? { fiat_amount: fiatAmount } : {}),
          ...(direction === 'offramp' ? { asset_amount_raw: assetAmountRaw } : {}),
          asset,
          chain_id: chainId,
          wallet_address: walletAddress,
        })
        .then((quote) => {
          if (mySeq !== seq.current) return
          setState({ quote, expiresIn: secondsUntil(quote.expires_at), loading: false, error: null })
        })
        .catch((e: unknown) => {
          if (mySeq !== seq.current) return
          const unavailable =
            e instanceof ApiClientError && (e.code === 'PROVIDER_UNAVAILABLE' || e.code === 'FIAT_RAILS_DISABLED')
          setState({ quote: null, expiresIn: 0, loading: false, error: unavailable ? 'unavailable' : 'failed' })
        })
    }, delay)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [direction, asset, chainId, walletAddress, fiatCurrency, fiatAmount, assetAmountRaw, nonce])

  // Countdown tick while a quote is live.
  useEffect(() => {
    if (state.quote === null || state.expiresIn <= 0) return
    const t = setTimeout(() => {
      setState((s) => (s.quote === null ? s : { ...s, expiresIn: secondsUntil(s.quote.expires_at) }))
    }, 1_000)
    return () => clearTimeout(t)
  }, [state.quote, state.expiresIn])

  return { ...state, refetch: () => setNonce((n) => n + 1) }
}

type QuoteData = Omit<FiatQuoteState, 'refetch'>

function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1_000))
}
