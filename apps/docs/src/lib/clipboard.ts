/**
 * What this browser will let the page do with the clipboard.
 *
 * Its own module rather than a second export beside `CopyButton`: a file that
 * exports both a component and a function loses fast refresh, and the eslint
 * rule that says so is right — the question "can this browser copy?" is not
 * about that button. `CodeBlock` asks it too, to decide whether to draw a bar
 * at all.
 */

/**
 * Whether this browser exposes the clipboard's write half.
 *
 * A FUNCTION, read at render rather than a constant read at module load: the
 * API is absent on an insecure origin and installed by a test harness around
 * the render, and an answer captured once would freeze the one from before it.
 */
export const canCopy = (): boolean => typeof navigator.clipboard?.writeText === 'function'
