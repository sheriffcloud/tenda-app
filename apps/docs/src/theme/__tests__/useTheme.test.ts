/**
 * Three theme modes: follow the system, pin light, pin dark — and the reader
 * can always get BACK to following the system.
 *
 * The un-stamped `system` state is the one most readers get, and it is the state
 * a `data-theme` attribute left lying around would break. So the hook is held to
 * all three, to the walk between them (the old toggle could only flip
 * light/dark, so one click ended "follow my system" for good), to a choice
 * surviving a reload, and to a blocked storage not taking the page down.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installMatchMedia, type FakeMedia } from '@/test-support/match-media'
import { nextMode, storedMode, useTheme } from '@/theme/useTheme'

let media: FakeMedia

beforeEach(() => {
  media = installMatchMedia('light')
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => { media.restore() })

const stamp = (): string | null => document.documentElement.getAttribute('data-theme')

describe('useTheme: following the system', () => {
  it('is the default, and stamps nothing', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('follows the system CHANGING, in both directions', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { media.setSystem('dark') })
    expect(result.current.theme).toBe('dark')
    act(() => { media.setSystem('light') })
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('opens dark when the reader’s system is already dark, and still stamps nothing', () => {
    // The commonest un-stamped case, and the one a light-only harness never
    // reaches: first load, no stored choice, an OS set to dark.
    media.restore()
    media = installMatchMedia('dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(result.current.mode).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('useTheme: pinning a side', () => {
  it('a pinned mode wins over the system, in both directions', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setMode('dark') })
    expect(result.current.theme).toBe('dark')
    expect(stamp()).toBe('dark')

    // The system going dark must not un-pin light.
    act(() => { result.current.setMode('light') })
    act(() => { media.setSystem('dark') })
    expect(result.current.theme).toBe('light')
    expect(stamp()).toBe('light')
  })

  it('a pinned mode is remembered for the next visit', () => {
    const first = renderHook(() => useTheme())
    act(() => { first.result.current.setMode('dark') })
    expect(storedMode()).toBe('dark')
    first.unmount()

    const second = renderHook(() => useTheme())
    expect(second.result.current.mode).toBe('dark')
    expect(second.result.current.theme).toBe('dark')
  })
})

describe('useTheme: the way back to the system', () => {
  it('cycle walks System → Light → Dark → System', () => {
    const { result } = renderHook(() => useTheme())
    const seen: string[] = [result.current.mode]
    for (let i = 0; i < 3; i += 1) {
      act(() => { result.current.cycle() })
      seen.push(result.current.mode)
    }
    expect(seen).toEqual(['system', 'light', 'dark', 'system'])
  })

  it('returning to system REMOVES the stamp and follows the system again', () => {
    const { result } = renderHook(() => useTheme())
    act(() => { result.current.setMode('dark') })
    expect(stamp()).toBe('dark')

    act(() => { result.current.setMode('system') })
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(result.current.theme).toBe('light')

    // …and it is genuinely following again, not frozen at the last pin.
    act(() => { media.setSystem('dark') })
    expect(result.current.theme).toBe('dark')
  })

  it('going back to system is remembered too — the next visit follows the system', () => {
    const first = renderHook(() => useTheme())
    act(() => { first.result.current.setMode('dark') })
    act(() => { first.result.current.setMode('system') })
    expect(storedMode()).toBe('system')
    first.unmount()

    const second = renderHook(() => useTheme())
    expect(second.result.current.mode).toBe('system')
  })
})

describe('nextMode', () => {
  it('is a three-step ring', () => {
    expect(nextMode('system')).toBe('light')
    expect(nextMode('light')).toBe('dark')
    expect(nextMode('dark')).toBe('system')
  })
})

describe('storedMode', () => {
  it('reads the three modes, including the two values written before system existed', () => {
    for (const mode of ['light', 'dark', 'system'] as const) {
      expect(storedMode({ getItem: () => mode })).toBe(mode)
    }
  })

  it('treats nothing, garbage and a storage that refuses to answer as following the system', () => {
    expect(storedMode({ getItem: () => null })).toBe('system')
    expect(storedMode({ getItem: () => 'purple' })).toBe('system')
    expect(storedMode({ getItem() { throw new Error('blocked') } })).toBe('system')
  })
})

describe('a storage that refuses to write', () => {
  it('still switches the theme for this visit', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem() { throw new Error('blocked') } },
    })
    try {
      const { result } = renderHook(() => useTheme())
      act(() => { result.current.cycle() })
      expect(result.current.mode).toBe('light')
      expect(stamp()).toBe('light')
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis, 'localStorage', original)
    }
  })
})

describe('a browser where merely touching localStorage throws', () => {
  // Chrome with site data blocked raises a SecurityError from the PROPERTY
  // GETTER, before any getItem/setItem is called. The page must still render
  // and still switch: the theme then lasts this visit.
  it('renders following the system, and still cycles', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('The operation is insecure.', 'SecurityError') },
    })
    try {
      expect(storedMode()).toBe('system')
      const { result } = renderHook(() => useTheme())
      expect(result.current.mode).toBe('system')
      act(() => { result.current.cycle() })
      expect(result.current.mode).toBe('light')
      expect(stamp()).toBe('light')
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis, 'localStorage', original)
    }
  })
})
