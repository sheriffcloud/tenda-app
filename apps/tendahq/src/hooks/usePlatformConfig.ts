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
 *   posterFeePct → base platform fee charged to posters / sellers
 *   seekerFeePct → discounted platform fee charged when the poster / seller
 *                  is on a Solana Mobile (Seeker) device. **Not** a worker
 *                  fee — workers and buyers pay zero today.
 *
 * `null` while loading or on error — caller decides fallback.
 */
export function useFeePercents(): { posterFeePct: number | null; seekerFeePct: number | null } {
  const { data } = usePlatformConfig()
  if (!data) return { posterFeePct: null, seekerFeePct: null }
  return {
    posterFeePct: data.fee_bps / 100,
    seekerFeePct: data.seeker_fee_bps / 100,
  }
}
