'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  closeCommandPalette,
  commandPaletteServerSnapshot,
  isCommandPaletteOpen,
  openCommandPalette,
  subscribeToCommandPalette,
} from '@/components/app/workspace/palette/palette-store'

/**
 * Palette open-state plus the global ⌘K / Ctrl-K shortcut.
 *
 * The shortcut is bound once by whoever hosts the palette. It fires even
 * while a field has focus — ⌘K is a chord, not typing, and a reader who has
 * just typed into a filter is exactly who wants to jump somewhere else.
 * preventDefault stops the browser's own ⌘K (search bar focus) from winning.
 */
export function useCommandPalette(): {
  open: boolean
  openPalette: () => void
  closePalette: () => void
} {
  const open = useSyncExternalStore(
    subscribeToCommandPalette,
    isCommandPaletteOpen,
    commandPaletteServerSnapshot,
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' && event.key !== 'K') return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      // Toggle: pressing it again closes, so the chord is its own escape.
      if (isCommandPaletteOpen()) closeCommandPalette()
      else openCommandPalette()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, openPalette: openCommandPalette, closePalette: closeCommandPalette }
}
