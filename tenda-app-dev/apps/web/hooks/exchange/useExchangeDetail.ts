/**
 * Web port of apps/mobile/hooks/useExchangeDetail.ts: loader for the
 * exchange-detail read surface (/v1/exchange/:id). `refresh` is reused by
 * every transition to re-pull after a confirmed tx. A `gone` refetch
 * DROPS the offer — an offer deleted or taken down mid-session must not
 * keep a live Accept on screen. A transient failure keeps the offer.
 * Mobile's focus refetch becomes mount.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { classifyDetailLoadError, type DetailLoadError } from '@tenda/shared'
import type { ExchangeDetail } from '@tenda/shared'

export function useExchangeDetail(id: string | undefined) {
  const [offer, setOffer] = useState<ExchangeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<DetailLoadError | null>(null)

  // Which fetch may write — one router.replace between two offer ids and a
  // slow response would paint the wrong offer without this.
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
      if (request === requestRef.current) setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { offer, isLoading, error, refresh }
}
