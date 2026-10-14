'use client'

import { useEffect, useRef } from 'react'
import { initCrossTabAuthSync } from '@/stores/auth/cross-tab'
import { useAuthStore } from '@/stores/auth.store'

/** Bootstraps the localStorage-backed session once and keeps tabs in sync. */
export function useSessionBootstrap(): void {
  const loadSession = useAuthStore((state) => state.loadSession)
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true
      if (useAuthStore.getState().isLoading) void loadSession()
    }
    return initCrossTabAuthSync()
  }, [loadSession])
}

