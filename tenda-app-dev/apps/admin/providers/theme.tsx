'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
interface ThemeContextValue {
  theme: Theme
  resolvedTheme: Theme
  setTheme: (theme: Theme) => void
}

const FALLBACK: ThemeContextValue = {
  theme: 'light', resolvedTheme: 'light', setTheme: () => {},
}
const ThemeContext = createContext<ThemeContextValue>(FALLBACK)

export function useAdminTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

/**
 * Script-free theme provider. SSR and hydration both start as light; the
 * saved/system preference is applied after mount, outside React hydration.
 */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try { localStorage.setItem('theme', next) } catch { /* storage may be unavailable */ }
  }, [])

  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => {
      if (!alive) return
      let next: Theme
      try {
        const saved = localStorage.getItem('theme')
        next = saved === 'light' || saved === 'dark'
          ? saved
          : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      } catch {
        next = 'light'
      }
      setThemeState(next)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
