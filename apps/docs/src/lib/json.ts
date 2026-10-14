/**
 * Reading JSON the document hands us, safely.
 *
 * Two things every consumer of an untyped JSON value needs, in one place
 * rather than re-derived per call site: narrowing a value to an object, and
 * looking a key up in a string-keyed record WITHOUT the prototype answering.
 *
 * `record[key]` is the repo's named hazard: `'toString' in {}` is true and
 * `({})['toString']` is a FUNCTION, so a lookup keyed by anything a document
 * or a URL can carry returns an inherited method instead of undefined and
 * every `=== undefined` guard behind it silently passes. It cost two tasks to
 * remove from the clients (#116, #154); this app does not re-introduce it.
 */
import type { ExampleValue } from '@tenda/api-doc'

/**
 * The value at `key`, or undefined — never something the prototype supplied.
 * Generic over the value so a caller keeps its own element type.
 */
export function lookup<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

/**
 * A JSON object, or null for anything else — the narrowing every reader of an
 * untyped body needs. Written as a type predicate because `Array.isArray` on
 * its own does not narrow a union whose other branch is a ReadonlyArray.
 */
const isRecord = (value: ExampleValue): value is Readonly<Record<string, ExampleValue>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function asRecord(value: ExampleValue): Readonly<Record<string, ExampleValue>> | null {
  return isRecord(value) ? value : null
}
