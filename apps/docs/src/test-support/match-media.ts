/**
 * A controllable `matchMedia` for jsdom, which ships none.
 *
 * The theme is the one thing on this page that reads the environment rather
 * than the document, so it needs an environment a test can move: `setSystem`
 * flips the preference and notifies every listener, the way a reader changing
 * their OS setting does.
 */
type Listener = (event: MediaQueryListEvent) => void

export interface FakeMedia {
  setSystem(theme: 'light' | 'dark'): void
  restore(): void
}

export function installMatchMedia(initial: 'light' | 'dark' = 'light'): FakeMedia {
  const listeners = new Set<Listener>()
  let matches = initial === 'dark'
  const original = window.matchMedia

  // `matches` is a GETTER: the real MediaQueryList reflects the current state
  // when a listener reads it, and a snapshot would let a passing test hide a
  // hook that reads a stale value.
  window.matchMedia = ((query: string) => ({
    get matches() { return matches },
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: Listener) => { listeners.add(listener) },
    removeEventListener: (_: string, listener: Listener) => { listeners.delete(listener) },
    addListener: (listener: Listener) => { listeners.add(listener) },
    removeListener: (listener: Listener) => { listeners.delete(listener) },
    dispatchEvent: () => true,
  })) as typeof window.matchMedia

  return {
    setSystem(theme) {
      matches = theme === 'dark'
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent)
    },
    restore() {
      window.matchMedia = original
      listeners.clear()
    },
  }
}
