/**
 * List-column copy. Surface-specific strings (title, empty state) are props —
 * only the strings that are the SAME on every workspace list live here, so a
 * surface can never drift on the shared ones.
 */

export const LIST_ERROR_COPY = {
  title: 'This list did not load',
  /**
   * The comps say this verbatim, and it earns its place: a failed list index
   * looks like lost money to the person reading it. Say what is unaffected.
   */
  body: 'Your escrows are unaffected. This is a read failure on the list index only.',
  retry: 'Try again',
} as const

export const LIST_KEYBOARD_HINT = {
  move: ['j', 'k'],
  open: 'Enter',
  /** The comps' promise: opening a row never navigates the list away. */
  suffix: 'the list never leaves.',
} as const

export const LIST_SKELETON_ROWS = 7
