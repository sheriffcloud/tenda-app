import { useEffect, useState } from 'react'
import { fetchPlatformConfig, type PlatformConfig } from '@/api/platform'

interface State {
  data: PlatformConfig | null
  loading: boolean
  error: Error | null
}

const initial: State = { data: null, loading: true, error: null }

export function usePlatformConfig(): State {
  const [state, setState] = useState<State>(initial)

  useEffect(() => {
    const ctrl = new AbortController()
    let mounted = true

    fetchPlatformConfig(ctrl.signal)
      .then((data) => {
        if (mounted) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!mounted || ctrl.signal.aborted) return
        setState({ data: null, loading: false, error: error instanceof Error ? error : new Error(String(error)) })
      })

    return () => {
      mounted = false
      ctrl.abort()
    }
  }, [])

  return state
}

/**
 * Convenience: returns fee percentages already converted from bps.
 *
 *   posterFeePct → the standard platform-fee rate
 *   seekerFeePct → the reduced rate applied when the escrow's creator is on a
 *                  Solana Mobile (Seeker) device
 *
 * WHICH RATE APPLIES vs WHO BEARS IT are two different questions, and the
 * names only answer the first. The CREATOR's Seeker status selects the rate
 * (`escrows.is_seeker` is baked from the poster/seller), but the fee is
 * DEDUCTED FROM THE COUNTERPARTY'S PAYOUT: both contracts settle
 * `amount − fee` to the worker/buyer (`_settleToCounterparty`,
 * `computeNetPayout`). This docstring used to say the fee was "charged to
 * posters / sellers" and that "workers and buyers pay zero today" — the exact
 * claim the landing copy was corrected for, left behind in the hook that
 * feeds the landing's fee figure.
 *
 * `null` while loading, on error, OR when the response does not carry a usable
 * number — callers fall back to the shared platform default.
 *
 * That last case is not paranoia. `fetchPlatformConfig` casts the parsed body
 * with `as PlatformConfig` and validates nothing, so the field only exists
 * because the server currently sends it. Divide a missing or renamed field by
 * 100 and the page renders **"NaN%"**; a null renders **"0%"**, which is worse
 * — it is a plausible, specific and false claim that Tenda takes no fee, shown
 * on the answer to "What does Tenda charge?". Guarding here rather than at each
 * call site keeps the hero and the FAQ from disagreeing about what counts as a
 * usable rate.
 *
 * `unknown` rather than `number` is the point: the declared type is what the
 * server promises, and this function exists precisely for the case where the
 * promise is not kept. Same reasoning as `isSupportedCurrency` in the shared
 * constants — a boundary check that takes the declared type asserts instead of
 * checking. Exported so the guard is testable without rendering a hook.
 */
export function toPercent(bps: unknown): number | null {
  // Finite AND non-negative: a negative rate is not a fee, and rendering
  // "-5%" would be a different kind of wrong answer to the same question.
  return typeof bps === 'number' && Number.isFinite(bps) && bps >= 0 ? bps / 100 : null
}

export function useFeePercents(): { posterFeePct: number | null; seekerFeePct: number | null } {
  const { data } = usePlatformConfig()
  if (!data) return { posterFeePct: null, seekerFeePct: null }
  return {
    posterFeePct: toPercent(data.fee_bps),
    seekerFeePct: toPercent(data.seeker_fee_bps),
  }
}
