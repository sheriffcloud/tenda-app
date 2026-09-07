/**
 * A promise the test resolves by hand, so "in flight" is a real state rather
 * than a race with the scheduler.
 *
 * Lives here because THREE suites had each written it out for themselves and
 * #93 would have made a fourth. Six suites import this one now (#94): the two
 * store suites, the three usePaginatedList suites that used to take it from
 * `hooks/pagination/__fixtures__/list-fixtures`, and the chat send suite #93
 * added. The fixtures module keeps fixtures; generic promise plumbing does not
 * belong in it.
 *
 * The three copies were read against this one before being deleted rather than
 * assumed identical. One put its body on a single line, one named the callback
 * parameters `v` and `e`, one matched apart from declaring no return type —
 * none differed in behaviour. Six files were run before and after and reported
 * the same 70 tests (9, 14, 10, 11, 16, 10); five of those six import this
 * helper, and `usePaginatedList.cursor` rode along as an untouched neighbour.
 *
 * Not under `__tests__/`, so it sits beside `setup.tsx` and the factories —
 * ungated like both, since it is harness rather than app code.
 */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
