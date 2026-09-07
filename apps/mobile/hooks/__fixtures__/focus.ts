/**
 * A controllable stand-in for `expo-router`'s `useFocusEffect`.
 *
 * The inline `useEffect`-only mock most tests use fires the callback exactly
 * once, which is fine for "does it load on mount" but cannot express the thing
 * tab screens actually depend on: real navigation RE-INVOKES the callback every
 * time the screen regains focus, while the screen stays mounted. Hooks that
 * refetch on focus are therefore untestable without a way to fire focus again.
 *
 * Usage — the factory must `require` this module rather than close over it,
 * because `jest.mock` is hoisted above the imports:
 *
 *   jest.mock('expo-router', () => {
 *     const React = require('react')
 *     const { registerFocus } = require('@/hooks/__fixtures__/focus')
 *     return { useFocusEffect: (cb: () => void) => React.useEffect(() => registerFocus(cb), [cb]) }
 *   })
 *
 * then drive later focuses with `act(() => refocus())`.
 */
type FocusCallback = () => void

const callbacks: FocusCallback[] = []

/**
 * Mount-time registration: runs the callback once (the initial focus) and
 * returns the unsubscribe, so an unmounted screen stops receiving focuses —
 * mirroring the real hook's effect contract.
 */
export function registerFocus(cb: FocusCallback): () => void {
  callbacks.push(cb)
  cb()
  return () => {
    const i = callbacks.indexOf(cb)
    if (i >= 0) callbacks.splice(i, 1)
  }
}

/** Re-focus every mounted screen, as navigating back to the tab would. */
export function refocus(): void {
  // Copied first: a callback is free to unmount something mid-iteration.
  for (const cb of [...callbacks]) cb()
}

/** Drop registrations between tests so one test's screens can't be refocused
 *  by the next one. */
export function resetFocus(): void {
  callbacks.length = 0
}
