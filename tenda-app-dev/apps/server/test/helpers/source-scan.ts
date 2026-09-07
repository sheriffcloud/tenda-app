/**
 * Helpers for tests that read the SOURCE TREE rather than run it.
 *
 * A few invariants in this app cannot be checked any other way — the thing that
 * would go wrong compiles, runs, and passes every behavioural test, and only a
 * human reading the file would notice. `new Queue(...)` built without the
 * shared retention options is the example that earned this: correct-looking
 * code whose only symptom is Redis never giving memory back.
 */

/**
 * Blank out comment bodies, PRESERVING line numbers so a failure can still name
 * the line.
 *
 * Without this, a scan matches the prose ABOUT the pattern it is looking for as
 * readily as the pattern itself — and prose is exactly where the pattern gets
 * discussed, so the false positive is close to guaranteed for any rule worth
 * documenting.
 *
 * Not a tokenizer, and callers have to account for that: a `//` inside a string
 * literal truncates that line, and a quoted brace or paren survives into the
 * output. A caller doing balanced-delimiter scanning must reject its own
 * overruns rather than trust this to have removed every confusing character —
 * see `queueConstructionSites` in test/unit/queue.test.ts, which does.
 */
export function stripComments(source: string): string {
  const blankKeepingNewlines = (m: string): string => m.replace(/[^\n]/g, ' ')
  return source.replace(/\/\*[\s\S]*?\*\//g, blankKeepingNewlines).replace(/\/\/[^\n]*/g, '')
}
