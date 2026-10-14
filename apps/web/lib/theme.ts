/**
 * Theme preference handling for the data-theme contract the generated
 * tokens.css implements: 'system' stamps nothing (prefers-color-scheme
 * decides), an explicit choice stamps data-theme="light|dark" on <html>.
 * Web replacement for mobile's UnistylesRuntime theme switching.
 */
export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme'

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

const listeners = new Set<() => void>()
let cachedPreference: ThemePreference | null = null

export function applyTheme(preference: ThemePreference): void {
  if (typeof document === 'undefined') return
  if (preference === 'system') {
    delete document.documentElement.dataset.theme
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } else {
    document.documentElement.dataset.theme = preference
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  }
  cachedPreference = preference
  for (const listener of listeners) listener()
}

/**
 * useSyncExternalStore seam for components that render the current
 * preference — the store shape avoids setState-in-effect (the stored value is
 * client-only, so the server snapshot is 'system' and React reconciles the
 * real one at hydration without a mismatch).
 */
export const themeStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot(): ThemePreference {
    cachedPreference ??= getStoredTheme()
    return cachedPreference
  },
  getServerSnapshot(): ThemePreference {
    return 'system'
  },
}

/**
 * Inline <head> script (root layout) so an explicit choice paints before
 * hydration — without it a dark-theme user gets a light flash every load.
 * Kept dependency-free and tiny; must mirror getStoredTheme/applyTheme.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`
