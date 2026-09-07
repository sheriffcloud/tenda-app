import type { ErrorCode } from '../constants/errors'

/**
 * A value a query string can carry. Arrays serialise CSV (`status=open,draft`),
 * which is what the list routes parse.
 */
export type QueryValue = string | number | boolean | readonly (string | number)[] | null | undefined

/**
 * The shape every `*Query` type in this package must satisfy, so an HTTP client
 * can serialise one WITHOUT a cast.
 *
 * This is why the query types are declared as `type X = { … }` rather than
 * `interface X { … }`: TypeScript gives an implicit index signature to an alias
 * of an object literal and withholds it from an interface, so an interface is
 * not assignable here. Before this, every list call laundered its query through
 * `as Record<string, unknown>`.
 *
 * That distinction is invisible while reading a query type, and the codebase
 * otherwise reaches for `interface` by default — so `assertQueryShape` below
 * makes the requirement a COMPILE error rather than a convention to remember.
 */
export type QueryParams = Record<string, QueryValue>

/**
 * Compile-time assertion that `T` is serialisable as a query string.
 *
 * Used once per query type in the shared test suite. Flipping any of them back
 * to `interface` fails the build there, naming the type — instead of the cast
 * quietly reappearing at every call site months later.
 */
export function assertQueryShape<T extends QueryParams>(): void {
  // Types only; the call exists so the constraint is checked.
}

export interface PaginatedResponse<T> {
  data:      T[]
  total:     number
  limit:     number
  offset:    number
  /** Present on endpoints that use capped queries — true means more rows exist beyond this page. */
  has_more?: boolean
  /** Opaque continuation token on keyset-paginated endpoints. */
  next_cursor?: string | null
}

export interface ApiError {
  statusCode: number
  error: string
  message: string
  code: ErrorCode
}
