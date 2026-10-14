import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { readStorage, writeStorage } from '@/lib/storage'
import {
  ThemeContext,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemeMode,
} from './theme-context'

const STORAGE_KEY = 'tenda:theme'

function readStoredMode(): ThemeMode {
  // Default is SYSTEM, matching apps/web (lib/theme.ts). It used to be 'dark',
  // which was the single biggest visual seam in the product: a visitor on a
  // light-mode machine met a dark landing, clicked "Open Web App", and landed
  // on a light one. The tokens in styles/tokens.css are light-dark() pairs
  // under `color-scheme: light dark` on the root, so the first paint already
  // follows the system before this provider has stamped it, and the stamp
  // then pins one side. The store is read through the guard in lib/storage:
  // a blocked store means "no preference", never a blank page.
  const v = readStorage(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved)
}

interface Props {
  children: ReactNode
}

export function ThemeProvider({ children }: Props) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    mode === 'system' ? systemTheme() : mode,
  )

  // Apply on mount and whenever resolved changes
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  // Track system changes when in 'system' mode
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    writeStorage(STORAGE_KEY, next)
    setResolved(next === 'system' ? systemTheme() : next)
  }, [])

  const toggle = useCallback(() => {
    // Toggling cycles the resolved theme regardless of system preference,
    // and pins the choice (no implicit return to 'system').
    setMode(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setMode])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
