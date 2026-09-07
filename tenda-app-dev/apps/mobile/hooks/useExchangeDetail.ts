import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { api } from '@/api/client'
import { classifyDetailLoadError, type DetailLoadError } from '@tenda/shared'
import type { ExchangeDetail } from '@tenda/shared'

/**
 * Loader for the exchange-detail read surface (/v1/exchange/:id). Refetches on
 * focus; `refresh` is reused by every transition to re-pull after a confirmed tx.
 *
 * A `gone` refetch DROPS the offer, for the reason spelled out in
 * lib/detail-load-error: without it, an offer deleted or taken down mid-session
 * kept rendering from the last good response — the screen only shows its error
 * branch when `offer` is null — leaving Accept live on something the server had
 * stopped serving. A transient failure keeps the offer on screen.
 */
export function useExchangeDetail(id: string | undefined) {
  const [offer, setOffer] = useState<ExchangeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<DetailLoadError | null>(null)

  /**
   * Which fetch may write, mirroring `gigs.store`. Today nothing can reach this
   * screen with a second id — every route in is a push (new instance) or a
   * replace from elsewhere — so the protection currently comes from the
   * NAVIGATION layer rather than from here. That is a fragile place for it to
   * live: one `router.replace` between two offer ids, added innocently, and a
   * slow response starts painting the wrong offer with nothing local to stop
   * it. Cheaper to own the invariant here than to rely on nobody doing that.
   */
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!id) return
    const request = ++requestRef.current
    setError(null)
    try {
      const next = await api.exchange.get({ id })
      if (request !== requestRef.current) return
      setOffer(next)
    } catch (e) {
      if (request !== requestRef.current) return
      const failure = classifyDetailLoadError(e)
      setError(failure)
      if (failure.gone) setOffer(null)
    } finally {
      // Superseded responses leave the spinner alone: it belongs to the newer
      // request, which is still running.
      if (request === requestRef.current) setIsLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return { offer, isLoading, error, refresh }
}
