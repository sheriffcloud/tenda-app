'use client'

/**
 * Loads the dispute's latest resolution proposal (or null). Same derive-only
 * pattern as use-dossier (no synchronous setState in the effect); a bumpable
 * key forces a refetch after propose/reject mutations.
 */

import { useCallback, useEffect, useState } from 'react'
import type { AdminResolutionView } from '@tenda/shared'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

interface ResolutionState {
  resolution: AdminResolutionView | null
  loading: boolean
  error: string | null
  reload: () => void
}

interface Settled {
  key: string
  resolution: AdminResolutionView | null
  error: string | null
}

export function useResolution(disputeId: string | null): ResolutionState {
  const [refreshKey, setRefreshKey] = useState(0)
  const [settled, setSettled] = useState<Settled>({ key: '', resolution: null, error: null })
  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])

  const key = disputeId === null ? '' : `${disputeId}:${refreshKey}`

  useEffect(() => {
    if (disputeId === null) return
    let alive = true
    adminApi.disputes
      .getResolution(disputeId)
      .then((resolution) => {
        if (alive) setSettled({ key, resolution, error: null })
      })
      .catch((err: unknown) => {
        if (!alive) return
        const error = err instanceof ApiError ? err.message : 'Failed to load resolution'
        setSettled({ key, resolution: null, error })
      })
    return () => {
      alive = false
    }
  }, [disputeId, key])

  const isCurrent = settled.key === key && key !== ''
  return {
    resolution: isCurrent ? settled.resolution : null,
    error: isCurrent ? settled.error : null,
    loading: disputeId !== null && !isCurrent,
    reload,
  }
}
