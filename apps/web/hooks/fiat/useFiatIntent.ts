'use client'

/**
 * Web port of apps/mobile/app/wallet/intents/[id].tsx's controller half — one
 * fiat intent, polled while it is still moving.
 *
 * Three behaviours carry over because each was reasoned once already:
 *   - polling STOPS at a terminal status (`isTerminal`), so a settled intent
 *     does not keep asking forever;
 *   - a 404 is `gone` and is a state, while a transient failure keeps the last
 *     known intent on screen — an outage must not blank a page that was
 *     showing someone their money;
 *   - recursive `setTimeout`, never `setInterval` (project rule — the delay is
 *     an idle gap, and non-overlap is structural).
 *
 * Mobile re-loads on screen FOCUS; a Next route unmounts on navigation, so the
 * equivalent is mount plus the poll.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError, isTerminal, type FiatIntentDetail } from '@tenda/shared'
import { api } from '@/api/client'
import { showToast } from '@/components/ui/Toast'

const POLL_MS = 10_000

export const FIAT_INTENT_COPY = {
  cancelFailed: 'Could not cancel',
} as const

export interface FiatIntentState {
  intent: FiatIntentDetail | null
  /** The intent does not exist (404) — distinct from "not loaded yet". */
  gone: boolean
  loading: boolean
  cancelling: boolean
  cancel: () => Promise<void>
  reload: () => void
}

export function useFiatIntent(id: string | undefined): FiatIntentState {
  const [intent, setIntent] = useState<FiatIntentDetail | null>(null)
  const [gone, setGone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    if (id === undefined || id === '') return
    try {
      const detail = await api.fiat.intent({ id })
      if (!alive.current) return
      setIntent(detail)
      if (!isTerminal(detail.status)) {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = setTimeout(() => void load(), POLL_MS)
      }
    } catch (e) {
      if (!alive.current) return
      // A 404 is an answer. Anything else keeps the last known intent: an
      // outage must not blank a page that was showing someone their money.
      if (e instanceof ApiClientError && e.statusCode === 404) setGone(true)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [load])

  const cancel = useCallback(async () => {
    if (intent === null || cancelling) return
    setCancelling(true)
    try {
      await api.fiat.cancelIntent({ id: intent.id })
      void load()
    } catch (e) {
      showToast('error', e instanceof ApiClientError ? e.message : FIAT_INTENT_COPY.cancelFailed)
    } finally {
      setCancelling(false)
    }
  }, [intent, cancelling, load])

  return { intent, gone, loading, cancelling, cancel, reload: () => void load() }
}
