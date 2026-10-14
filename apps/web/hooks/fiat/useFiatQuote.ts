'use client'

/**
 * Web port of apps/mobile/hooks/useFiatQuote.ts — a debounced fiat quote with
 * an expiry countdown, so the surface can prompt a re-quote instead of letting
 * someone submit against a price that has gone.
 *
 * Duplicated rather than shared ON PURPOSE: shared carries zero React (project
 * rule), so hooks stay per-client — the same reason `usePaginatedList` exists
 * twice. What must NOT diverge is the behaviour, and it is the behaviour that
 * is load-bearing here:
 *
 *   - the debounce only coalesces TYPING; a manual refetch fires immediately,
 *   - a stale response is dropped by sequence, so a slow quote for an amount
 *     the reader has already changed never repaints the panel,
 *   - `unavailable` is kept distinct from `failed`, because "the rails are off"
 *     and "the request broke" need different copy and only one is retryable.
 *
 * Asset, chain, wallet and currency are all supplied by the caller: nothing
 * about a market is hardcoded here.
 *
 * DIVERGES from mobile in one way, deliberately: which inputs a stored quote
 * belongs to is tracked as a key and compared during RENDER, rather than
 * cleared by a setState inside the effect. Same behaviour, and it closes a
 * frame mobile has — after the amount changes, the previous amount's quote is
 * no longer briefly displayed as if it were the new one.
 */
import { useEffect, useRef, useState } from 'react'
import { ApiClientError, type FiatQuoteResponse } from '@tenda/shared'
import { api } from '@/api/client'

const DEBOUNCE_MS = 600

export interface FiatQuoteState {
  quote: FiatQuoteResponse | null
  /** Seconds until the active quote expires (0 when none, or expired). */
  expiresIn: number
  loading: boolean
  /** 'unavailable' = the rails are off; 'failed' = the request broke. */
  error: 'unavailable' | 'failed' | null
  /** Re-runs the fetch with the same inputs — the retry after failure or expiry. */
  refetch: () => void
}

export interface FiatQuoteInput {
  direction: 'onramp' | 'offramp'
  /** Asset registry id being traded (e.g. 'USDC_BASE'). */
  asset: string
  /** CAIP-2 chain the asset lives on. */
  chainId: string
  /** The seller's wallet address on that chain. */
  walletAddress: string
  /** ISO-4217, derived from the payout account's country. */
  fiatCurrency: string
  /** Onramp only: fiat the user pays. */
  fiatAmount?: number
  /** Offramp only: base units the user sells. */
  assetAmountRaw?: string
}

type QuoteData = Omit<FiatQuoteState, 'refetch'>
/** A stored quote plus the inputs it was fetched for. */
type KeyedQuote = QuoteData & { key: string | null }

const EMPTY: QuoteData = { quote: null, expiresIn: 0, loading: false, error: null }
const EMPTY_KEYED: KeyedQuote = { ...EMPTY, key: null }

function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1_000))
}

export function useFiatQuote(input: FiatQuoteInput | null): FiatQuoteState {
  const [state, setState] = useState<KeyedQuote>(EMPTY_KEYED)
  const [nonce, setNonce] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)
  const lastNonce = useRef(0)

  // Destructured so the effect depends on the VALUES, not on an object the
  // caller rebuilds every render.
  const direction = input?.direction ?? null
  const asset = input?.asset
  const chainId = input?.chainId
  const walletAddress = input?.walletAddress
  const fiatCurrency = input?.fiatCurrency
  const fiatAmount = input?.fiatAmount
  const assetAmountRaw = input?.assetAmountRaw

  const ready =
    direction !== null &&
    asset !== undefined &&
    chainId !== undefined &&
    walletAddress !== undefined &&
    fiatCurrency !== undefined &&
    (direction === 'onramp'
      ? fiatAmount !== undefined && fiatAmount > 0
      : assetAmountRaw !== undefined && assetAmountRaw !== '0' && assetAmountRaw !== '')
  // Identity of the inputs a quote would answer for. `null` when there is
  // nothing to ask, which is also how "no quote applies" is expressed.
  const inputKey = ready
    ? JSON.stringify([direction, asset, chainId, walletAddress, fiatCurrency, fiatAmount, assetAmountRaw])
    : null

  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    if (!ready) return

    // A manual refetch (nonce bump) fires immediately — the debounce exists
    // only to coalesce typing.
    const delay = nonce !== lastNonce.current ? 0 : DEBOUNCE_MS
    lastNonce.current = nonce
    timer.current = setTimeout(() => {
      const mySeq = ++seq.current
      // Inside the timer, not the effect body: a synchronous setState there
      // cascades a render, and this is the only case render cannot already
      // derive — a manual REFETCH of inputs that have not changed, where the
      // key still matches and the stale quote is deliberately left on screen.
      setState((s) => ({ ...s, loading: true, error: null }))
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
          setState({ quote, expiresIn: secondsUntil(quote.expires_at), loading: false, error: null, key: inputKey })
        })
        .catch((e: unknown) => {
          if (mySeq !== seq.current) return
          const unavailable =
            e instanceof ApiClientError &&
            (e.code === 'PROVIDER_UNAVAILABLE' || e.code === 'FIAT_RAILS_DISABLED')
          setState({ quote: null, expiresIn: 0, loading: false, error: unavailable ? 'unavailable' : 'failed', key: inputKey })
        })
    }, delay)

    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [direction, asset, chainId, walletAddress, fiatCurrency, fiatAmount, assetAmountRaw, nonce, ready, inputKey])

  // Countdown tick while a quote is live. Recursive setTimeout, never
  // setInterval (project rule — the delay is an idle gap).
  useEffect(() => {
    if (state.quote === null || state.expiresIn <= 0) return
    const t = setTimeout(() => {
      setState((s) => (s.quote === null ? s : { ...s, expiresIn: secondsUntil(s.quote.expires_at) }))
    }, 1_000)
    return () => clearTimeout(t)
  }, [state.quote, state.expiresIn])

  const refetch = () => setNonce((n) => n + 1)
  // A stored answer only counts for the inputs it was fetched for. Anything
  // else — not ready, or the reader has typed since — reads as empty, and as
  // LOADING while a fetch for the current inputs is on its way.
  if (state.key !== inputKey) {
    return { ...EMPTY, loading: ready, refetch }
  }
  return { quote: state.quote, expiresIn: state.expiresIn, loading: state.loading, error: state.error, refetch }
}
