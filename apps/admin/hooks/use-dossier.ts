'use client'

/**
 * Loads the admin escrow dossier for a dispute's escrow. Lifted to a hook
 * so the dispute detail page can share ONE fetch between the context panel
 * and the thread's party-labelled bubbles (no double fetch, no drift).
 *
 * setState is only ever called from the async callbacks (never synchronously
 * in the effect — react-hooks/set-state-in-effect). loading/dossier/error are
 * DERIVED by comparing the settled result's escrow id to the requested one,
 * so a stale result never leaks across an id change.
 */

import { useEffect, useState } from 'react'
import type { AdminEscrowDossier } from '@tenda/shared'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

interface DossierState {
  dossier: AdminEscrowDossier | null
  loading: boolean
  error: string | null
}

interface Settled {
  escrowId: string | null
  dossier: AdminEscrowDossier | null
  error: string | null
}

const IDLE: Settled = { escrowId: null, dossier: null, error: null }

export function useEscrowDossier(escrowId: string | null): DossierState {
  const [settled, setSettled] = useState<Settled>(IDLE)

  useEffect(() => {
    if (escrowId === null) return
    let alive = true
    adminApi.escrows
      .dossier(escrowId)
      .then((dossier) => {
        if (alive) setSettled({ escrowId, dossier, error: null })
      })
      .catch((err: unknown) => {
        if (!alive) return
        const error = err instanceof ApiError ? err.message : 'Failed to load context'
        setSettled({ escrowId, dossier: null, error })
      })
    return () => {
      alive = false
    }
  }, [escrowId])

  // Data is valid only when the settled result belongs to the current id.
  const isCurrent = settled.escrowId === escrowId
  return {
    dossier: isCurrent ? settled.dossier : null,
    error: isCurrent ? settled.error : null,
    loading: escrowId !== null && !isCurrent,
  }
}
