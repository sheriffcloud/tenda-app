import { useEffect, useState } from 'react'
import { fetchHealth, type HealthResponse } from '@/api/platform'

interface State {
  data: HealthResponse | null
  loading: boolean
  error: Error | null
}

const initial: State = { data: null, loading: true, error: null }

/**
 * Polls the public `/v1/health` endpoint once on mount. Backed by a 30s
 * module-level cache in `api/platform.ts` so multiple consumers share one
 * request. Returns `data` once resolved; `error` non-null when unreachable
 * (the footer renders an "Unavailable" status in that case).
 */
export function useHealth(): State {
  const [state, setState] = useState<State>(initial)

  useEffect(() => {
    const ctrl = new AbortController()
    let mounted = true

    fetchHealth(ctrl.signal)
      .then((data) => {
        if (mounted) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!mounted || ctrl.signal.aborted) return
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => {
      mounted = false
      ctrl.abort()
    }
  }, [])

  return state
}
