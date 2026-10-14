/**
 * Which side of every `light-dark()` pair this page shows.
 *
 * THREE MODES, the same vocabulary the landing's ThemeProvider uses (it reads
 * the same generated tokens): `system` follows the reader's OS and stamps
 * nothing on the page; `light` and `dark` pin one side. The part this app adds
 * over the landing is the un-stamped `system` state, which is the one
 * `color-scheme: light dark` is written for — and the reader can always get
 * back to it, because `cycle` goes System → Light → Dark → System. A toggle
 * that only flipped light/dark let a single click permanently end "follow my
 * system".
 *
 * Local to this app rather than shared: `@tenda/shared` is deliberately
 * React-free and zero-dependency, so every client keeps its own small theme
 * hook (mobile has one, the landing has one). What IS shared is the token file
 * they all render, which is the part that could drift.
 */
import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
/** What is actually showing — `system` resolved to a side. */
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'tenda-docs-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The order the header button walks. */
const CYCLE: readonly ThemeMode[] = ['system', 'light', 'dark']

export function nextMode(mode: ThemeMode): ThemeMode {
  return CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]
}

/**
 * `matchMedia` is absent in some environments (jsdom without a shim, very old
 * browsers). A docs page that threw there would render nothing at all, so the
 * missing case resolves to light rather than crashing.
 */
const media = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null

const systemTheme = (): ResolvedTheme => (media()?.matches === true ? 'dark' : 'light')

/**
 * The stored mode, or `system` when there is none, it is unrecognised, or the
 * store cannot be read. Values written before `system` existed were only ever
 * `light` or `dark`, and both are still valid modes.
 */
export function storedMode(storage?: Pick<Storage, 'getItem'>): ThemeMode {
  try {
    // Resolved INSIDE the try: with site data blocked, a browser raises a
    // SecurityError from the `localStorage` getter itself, so a default
    // parameter would throw before the guard could catch it.
    const saved = (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  } catch {
    // A browser with storage blocked still gets a working page — it just
    // follows the system every visit.
    return 'system'
  }
}

function persist(mode: ThemeMode): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, mode)
  } catch {
    /* storage blocked — the choice lasts this visit */
  }
}

export function useTheme(): {
  mode: ThemeMode
  theme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  cycle: () => void
} {
  const [mode, setModeState] = useState<ThemeMode>(() => storedMode())
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme)

  useEffect(() => {
    const query = media()
    if (query === null) return
    const onChange = (): void => { setSystem(query.matches ? 'dark' : 'light') }
    query.addEventListener('change', onChange)
    return () => { query.removeEventListener('change', onChange) }
  }, [])

  const theme: ResolvedTheme = mode === 'system' ? system : mode

  useEffect(() => {
    // No stamp while the reader is following the system: the un-stamped state
    // is the one `color-scheme: light dark` is written for.
    if (mode === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    persist(next)
  }, [])

  const cycle = useCallback(() => { setMode(nextMode(mode)) }, [mode, setMode])

  return { mode, theme, setMode, cycle }
}
