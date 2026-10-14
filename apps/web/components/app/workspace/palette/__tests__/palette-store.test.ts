/**
 * The module store behind the palette. Direct tests because the hook cannot
 * reach the idempotence guards or the SSR snapshot through React.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeCommandPalette,
  openCommandPalette,
  resetCommandPaletteForTests,
} from '@/components/app/workspace/palette'
import {
  commandPaletteServerSnapshot,
  isCommandPaletteOpen,
  subscribeToCommandPalette,
} from '@/components/app/workspace/palette/palette-store'

afterEach(() => {
  resetCommandPaletteForTests()
})

describe('palette store', () => {
  it('opens and closes', () => {
    openCommandPalette()
    expect(isCommandPaletteOpen()).toBe(true)
    closeCommandPalette()
    expect(isCommandPaletteOpen()).toBe(false)
  })

  it('does not notify twice for a redundant open', () => {
    const listener = vi.fn()
    subscribeToCommandPalette(listener)
    openCommandPalette()
    openCommandPalette()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify for a redundant close', () => {
    const listener = vi.fn()
    subscribeToCommandPalette(listener)
    closeCommandPalette()
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToCommandPalette(listener)
    unsubscribe()
    openCommandPalette()
    expect(listener).not.toHaveBeenCalled()
  })

  it('is never open in the server snapshot, so SSR and hydration agree', () => {
    openCommandPalette()
    expect(commandPaletteServerSnapshot()).toBe(false)
  })
})
