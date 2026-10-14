import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStorage, writeStorage } from '../storage'

/**
 * The storage getter can throw, and a page that reads it while rendering
 * throws with it. These pin the degraded answer for every way the store can
 * be unreachable, and the plain answer when it is not.
 */
afterEach(() => vi.unstubAllGlobals())

const withStore = (store: Partial<Storage>) => vi.stubGlobal('window', { localStorage: store })

describe('storage', () => {
  it('reads and writes through a working store', () => {
    const backing = new Map<string, string>()
    withStore({
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    })
    expect(readStorage('tenda:theme')).toBeNull()
    writeStorage('tenda:theme', 'dark')
    expect(readStorage('tenda:theme')).toBe('dark')
  })

  it('answers null and swallows the write when the store getter throws', () => {
    // Chrome with site data blocked: the property access itself throws.
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('Access is denied for this document.', 'SecurityError')
      },
    })
    expect(readStorage('tenda:theme')).toBeNull()
    expect(() => writeStorage('tenda:theme', 'dark')).not.toThrow()
  })

  it('answers null and swallows the write when setItem itself throws', () => {
    // Safari private mode: the store exists but refuses writes (quota 0).
    withStore({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      },
    })
    expect(() => writeStorage('tenda:theme', 'light')).not.toThrow()
    expect(readStorage('tenda:theme')).toBeNull()
  })

  it('answers null with no window at all', () => {
    expect(typeof window).toBe('undefined')
    expect(readStorage('tenda:theme')).toBeNull()
    expect(() => writeStorage('tenda:theme', 'light')).not.toThrow()
  })
})
