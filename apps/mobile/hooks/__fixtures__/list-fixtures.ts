/**
 * Shared helpers for the usePaginatedList suites, which are split by concern
 * (loading/paging, refresh semantics, caching, cursors, races) to stay inside
 * the 300-line limit.
 *
 * They were already written three times before the split — `page`, `deferred`,
 * `keyOf` and `rows` appeared in the main, cursor and races files, with `page`
 * carrying two DIFFERENT signatures depending on which paging mode the file
 * was about. Splitting the suite further would have made that four. Pure data
 * and promise plumbing, no `jest.mock`, so importing this cannot affect a
 * suite's module registry. Mirrors apps/web's `pagination/__fixtures__`.
 */
import type { PaginatedResponse } from '@tenda/shared'

export interface Row {
  id: string
}

export const keyOf = (r: Row) => r.id
export const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }))

/** An offset-paginated page. */
export function page(data: Row[], total: number, offset = 0): PaginatedResponse<Row> {
  return { data, total, limit: 20, offset }
}

/**
 * A cursor-paginated page, for the live-list traversal the server drives.
 * Named apart from `page` because the two are not interchangeable: this one
 * carries `next_cursor` and a page size of 2, and passing one where the other
 * is meant silently changes which paging mode is under test.
 */
export function cursorPage(data: Row[], next_cursor: string | null): PaginatedResponse<Row> {
  return { data, total: 4, limit: 2, offset: 0, next_cursor }
}

/** A promise whose settlement the test controls, for racing scenarios. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
