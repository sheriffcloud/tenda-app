/**
 * usePaginatedList — the two races that only show up when a response and the
 * user disagree about what the list currently is.
 *
 * Both branches were uncovered: the suite proved the hook drops a stale
 * SUCCESS, but never that it drops a stale FAILURE, and it exercised realtime
 * updates that changed the count but never one that did not. Split into its
 * own file because the main suite is already well past the 300-line limit.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { deferred, keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'


test('a stale request that FAILS cannot put an error on the query that replaced it', async () => {
  // The success path of this race was covered; the failure path was not. It
  // matters more: an error banner is what the reader sees, and attributing a
  // dead query's failure to the live one shows a broken list that loaded fine.
  const stale = deferred<PaginatedResponse<Row>>()
  const fetchPage = jest
    .fn()
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValueOnce(page(rows('fresh'), 1))

  const { result, rerender } = renderHook(
    ({ q }: { q: { filter: string } }) =>
      usePaginatedList({ fetchPage, query: q, keyOf }),
    { initialProps: { q: { filter: 'a' } } },
  )

  // Move to another query while the first is still in flight, then fail it.
  rerender({ q: { filter: 'b' } })
  await waitFor(() => expect(result.current.items).toEqual(rows('fresh')))
  await act(async () => {
    stale.reject(new Error('the abandoned query died'))
    await Promise.resolve()
  })

  expect(result.current.error).toBeNull()
  expect(result.current.items).toEqual(rows('fresh'))
})

test('a realtime replace of the same SIZE keeps the server total', async () => {
  // Replacing one row with another is the common realtime shape (an edit, not
  // an insert or a delete). The total must not drift on it — the server owns
  // that number, and nudging it here would desync the "N of M" the list shows.
  //
  // What this does NOT prove is the `if (delta !== 0)` guard around the write.
  // With delta 0 the computed total equals the current one, so guarded and
  // unguarded assign the same value and React bails on the identical setState:
  // the branch is behaviourally indistinguishable, and a mutation removing it
  // survives on purpose. It is an allocation-saving guard, not a rule. The
  // arithmetic below is what keeps the total honest.
  const fetchPage = jest.fn().mockResolvedValue(page(rows('a', 'b'), 57))
  const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
  await waitFor(() => expect(result.current.total).toBe(57))

  act(() => result.current.applyRealtimeItems(rows('a', 'edited')))

  expect(result.current.items).toEqual(rows('a', 'edited'))
  expect(result.current.total).toBe(57)
})
