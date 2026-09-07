/**
 * The app's keyboard vocabulary, in one place.
 *
 * Two surfaces walk a list with the same keys — the workspace list column and
 * the public feed — and they do it by different mechanisms (React index state
 * vs. moving DOM focus), which is exactly the situation where "j means next"
 * gets written twice and one of them quietly loses ArrowDown.
 */

/** Move to the next row, per the comps' "j k to walk · Enter to open". */
export const NEXT_KEYS: ReadonlySet<string> = new Set(['j', 'ArrowDown'])
export const PREVIOUS_KEYS: ReadonlySet<string> = new Set(['k', 'ArrowUp'])

/**
 * True when the key belongs to whatever the user is typing into rather than
 * to the list. Without this, typing "join" in a search field walks the list.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
