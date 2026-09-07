import { useEffect, useState } from 'react'
import { fetchExchangeRates, type ExchangeRatesResponse } from '@/api/platform'

interface State {
  data: ExchangeRatesResponse | null
  loading: boolean
  error: Error | null
}

const initial: State = { data: null, loading: true, error: null }

export function useExchangeRates(): State {
  const [state, setState] = useState<State>(initial)

  useEffect(() => {
    const ctrl = new AbortController()
    let mounted = true

    fetchExchangeRates(ctrl.signal)
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
