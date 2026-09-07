'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'
import { applyTheme, themeStore } from '@/lib/theme'

const DARK_THEME_QUERY = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_THEME_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function systemThemeIsDark(): boolean {
  return window.matchMedia(DARK_THEME_QUERY).matches
}

/**
 * Light/dark toggle over the data-theme contract. Reads the preference
 * through the theme store's useSyncExternalStore seam: the server snapshot
 * is 'system', the client one is the stored choice, and React reconciles
 * them at hydration without a mismatch or a setState-in-effect.
 */
export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean } = {}) {
  const preference = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  )
  const systemIsDark = useSyncExternalStore(subscribeToSystemTheme, systemThemeIsDark, () => false)
  const isDark = preference === 'dark' || (preference === 'system' && systemIsDark)

  function toggle() {
    applyTheme(isDark ? 'light' : 'dark')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      // Default keeps the previous top-nav geometry; the rail passes its own
      // 40px slot so every rail control sits on one grid.
      className={cn(
        'rounded-control text-content-secondary hover:bg-surface-inset hover:text-content-primary',
        className ?? 'p-2',
      )}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      {showLabel && <span className="min-w-0 flex-1 text-left text-sm font-semibold">{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}
