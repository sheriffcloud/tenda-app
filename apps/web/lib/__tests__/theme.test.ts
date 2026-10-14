/** data-theme contract: explicit choice stamps the attribute, system stamps nothing. */
import { applyTheme, getStoredTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme'

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('applyTheme / getStoredTheme', () => {
  it('dark stamps data-theme and persists', () => {
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('light stamps data-theme and persists', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(getStoredTheme()).toBe('light')
  })

  it('system removes the attribute and the stored value', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(getStoredTheme()).toBe('system')
  })

  it('garbage in storage reads as system', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    expect(getStoredTheme()).toBe('system')
  })
})

describe('THEME_INIT_SCRIPT', () => {
  it('replays a stored explicit choice before hydration', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    // Executing the inline <head> script exactly as the browser would.
    eval(THEME_INIT_SCRIPT)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('stamps nothing for system (absent) preference', () => {
    // Executing the inline <head> script exactly as the browser would.
    eval(THEME_INIT_SCRIPT)
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
