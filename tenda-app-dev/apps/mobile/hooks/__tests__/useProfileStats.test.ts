/**
 * useProfileStats — profile counts as server COUNTs (open_issues MB2).
 * The point of the hook is that a status-bucketed count is NOT derivable from
 * a page of rows, so these tests pin the request shape as much as the output.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockList = jest.fn()
jest.mock('@/api/client', () => ({ api: { gigs: { list: (...a: unknown[]) => mockList(...a) } } }))

// useFocusEffect ≡ useEffect for a mounted screen.
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) }
})

import { POSTED_ESCROW_STATUSES } from '@tenda/shared'
import { useProfileStats } from '@/hooks/useProfileStats'

const ACTIVE = ['open', 'accepted', 'submitted']

const sameSet = (a: string[] | undefined, b: readonly string[]) =>
  a !== undefined && a.length === b.length && a.every((v) => b.includes(v))

/** Answer each of the three count queries by its filter shape. */
function respondWith({ posted, active, completed }: { posted: number; active: number; completed: number }) {
  mockList.mockImplementation((q: { mine: string; status?: string[] }) => {
    if (q.mine === 'working') return Promise.resolve({ data: [], total: completed, limit: 1, offset: 0 })
    // Both created-queries now carry a status filter, so they are told apart
    // by WHICH bucket they ask for, not by whether one is present.
    if (sameSet(q.status, ACTIVE)) return Promise.resolve({ data: [], total: active, limit: 1, offset: 0 })
    return Promise.resolve({ data: [], total: posted, limit: 1, offset: 0 })
  })
}

beforeEach(() => mockList.mockReset())

test('reads each count off `total`, asking for the smallest legal page', async () => {
  respondWith({ posted: 137, active: 4, completed: 22 })
  const { result } = renderHook(() => useProfileStats('u1'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  // 137 posted is past the old limit:100 page — the count that page could
  // never have produced is exactly the regression this guards.
  expect(result.current.posted).toBe(137)
  expect(result.current.active).toBe(4)
  expect(result.current.completed).toBe(22)

  for (const [query] of mockList.mock.calls) {
    expect(query.limit).toBe(1)
  }
})

test('asks the server for the status buckets rather than filtering client-side', async () => {
  respondWith({ posted: 1, active: 1, completed: 1 })
  renderHook(() => useProfileStats('u1'))
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3))

  expect(mockList).toHaveBeenCalledWith({
    mine: 'created',
    status: [...POSTED_ESCROW_STATUSES],
    limit: 1,
  })
  expect(mockList).toHaveBeenCalledWith({
    mine: 'created',
    status: ['open', 'accepted', 'submitted'],
    limit: 1,
  })
  expect(mockList).toHaveBeenCalledWith({ mine: 'working', status: ['completed'], limit: 1 })
})

test('the posted count asks for a status bucket that EXCLUDES drafts', async () => {
  // The bug this guards: an unfiltered `mine=created` returns every status
  // including `draft`, so starting a gig and abandoning it before funding
  // bumped the profile's "Posted" figure.
  respondWith({ posted: 1, active: 1, completed: 1 })
  const { result } = renderHook(() => useProfileStats('u1'))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  const created = mockList.mock.calls
    .map(([q]: [{ mine: string; status?: string[] }]) => q)
    .filter((q) => q.mine === 'created')

  expect(created.length).toBeGreaterThan(0)
  for (const q of created) {
    expect(q.status).toBeDefined()
    expect(q.status).not.toContain('draft')
  }
})

test('does not query before the user id is known', async () => {
  respondWith({ posted: 1, active: 1, completed: 1 })
  const { result } = renderHook(() => useProfileStats(undefined))
  await waitFor(() => expect(result.current.status).toBe('idle'))
  expect(mockList).not.toHaveBeenCalled()
})

test('starts from zero on an account switch instead of showing the previous counts', async () => {
  respondWith({ posted: 9, active: 9, completed: 9 })
  const { result, rerender } = renderHook(({ id }: { id: string }) => useProfileStats(id), {
    initialProps: { id: 'u1' },
  })
  await waitFor(() => expect(result.current.posted).toBe(9))

  mockList.mockImplementation(() => new Promise(() => {})) // next account, still loading
  rerender({ id: 'u2' })
  expect(result.current.posted).toBe(0)
  expect(result.current.status).not.toBe('ready')
})

test('a superseded response never overwrites the current account counts', async () => {
  let resolveFirst: ((v: unknown) => void) | undefined
  mockList.mockImplementationOnce(() => new Promise((res) => { resolveFirst = res }))
  mockList.mockImplementation(() => Promise.resolve({ data: [], total: 5, limit: 1, offset: 0 }))

  const { result, rerender } = renderHook(({ id }: { id: string }) => useProfileStats(id), {
    initialProps: { id: 'u1' },
  })
  rerender({ id: 'u2' })
  await waitFor(() => expect(result.current.posted).toBe(5))

  await act(async () => { resolveFirst?.({ data: [], total: 999, limit: 1, offset: 0 }) })
  expect(result.current.posted).toBe(5)
})

test('a failed count is ERROR, never a zero presented as an answer', async () => {
  // What this test used to assert was the bug: it waited for loaded===true and
  // checked posted===0 under the comment "counts stay at their last value" —
  // but the reset effect had already zeroed them, so the screen stated that
  // the account had posted nothing when the truth was that it could not check.
  mockList.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useProfileStats('u1'))

  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.status).not.toBe('ready')
})

test('a genuine zero is READY — the failure state must not swallow real zeroes', async () => {
  respondWith({ posted: 0, active: 0, completed: 0 })
  const { result } = renderHook(() => useProfileStats('u1'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(0)
  expect(result.current.completed).toBe(0)
})

test('reload retries after a failure and can reach ready', async () => {
  mockList.mockRejectedValue(new Error('offline'))
  const { result } = renderHook(() => useProfileStats('u1'))
  await waitFor(() => expect(result.current.status).toBe('error'))

  respondWith({ posted: 3, active: 1, completed: 2 })
  act(() => result.current.reload())

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(3)
})

test('a focus REFETCH over settled counts keeps them, and stays ready', async () => {
  // Unlike web, this hook refetches on every focus. Dropping back to
  // 'loading' there would blank two numbers the reader is already looking at,
  // every time they return to the tab.
  respondWith({ posted: 5, active: 1, completed: 4 })
  const { result } = renderHook(() => useProfileStats('u1'))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  mockList.mockImplementation(() => new Promise(() => {})) // refetch in flight
  act(() => result.current.reload())

  expect(result.current.status).toBe('ready')
  expect(result.current.posted).toBe(5)
})

test('reload refetches every count', async () => {
  respondWith({ posted: 1, active: 1, completed: 1 })
  const { result } = renderHook(() => useProfileStats('u1'))
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3))

  respondWith({ posted: 2, active: 2, completed: 2 })
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.posted).toBe(2))
})

test('a superseded FAILED request does not settle the new account loading state', async () => {
  // The old account's request rejects after the switch. Marking `loaded` from
  // that stale failure would let the new account render zeroes as fact while
  // its own counts are still in flight.
  let rejectFirst: ((e: Error) => void) | undefined
  mockList.mockImplementationOnce(() => new Promise((_res, rej) => { rejectFirst = rej }))
  mockList.mockImplementation(() => new Promise(() => {})) // new account: still loading

  const { result, rerender } = renderHook(({ id }: { id: string }) => useProfileStats(id), {
    initialProps: { id: 'u1' },
  })
  rerender({ id: 'u2' })

  await act(async () => { rejectFirst?.(new Error('stale')) })
  expect(result.current.status).not.toBe('error')
  expect(result.current.status).not.toBe('ready')
})

test('loads exactly ONE round of counts on mount, not two', async () => {
  // The hook owns its focus refetch. When the screen also called reload() on
  // focus, mount fired 3 + 3 = 6 requests — the same double-fetch pattern that
  // was fixed on My Gigs and Trade.
  respondWith({ posted: 1, active: 1, completed: 1 })
  renderHook(() => useProfileStats('u1'))
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3))

  await new Promise((r) => setTimeout(r, 20))
  expect(mockList).toHaveBeenCalledTimes(3)
})
