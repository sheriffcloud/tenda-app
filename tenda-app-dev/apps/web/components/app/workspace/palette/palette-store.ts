/**
 * Open/close state for the command palette, as a module store rather than a
 * React context — the same shape as showToast, and for the same reason: the
 * ⌘K button lives in a list column rendered by the @list parallel-route slot,
 * which is a sibling of the palette host, not a descendant. A context would
 * have to wrap both from the layout and thread a provider through a slot
 * boundary; a module store just works from anywhere.
 */

let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function openCommandPalette(): void {
  if (open) return
  open = true
  emit()
}

export function closeCommandPalette(): void {
  if (!open) return
  open = false
  emit()
}

export function subscribeToCommandPalette(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isCommandPaletteOpen(): boolean {
  return open
}

/** Server snapshot: the palette is never open during SSR. */
export function commandPaletteServerSnapshot(): boolean {
  return false
}

/** Test seam. */
export function resetCommandPaletteForTests(): void {
  open = false
  emit()
}
