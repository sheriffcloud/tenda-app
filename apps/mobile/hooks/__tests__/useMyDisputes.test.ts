/**
 * useMyDisputes — loads the caller's disputes for one status bucket, surfaces
 * errors, refetches when the segment (status) changes, and re-reads on a later
 * focus so returning from a dispute thread can't leave a resolved dispute
 * sitting in the Open bucket.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { MyDisputeRow } from '@tenda/shared'

const mockMine = jest.fn()
jest.mock('@/api/client', () => ({ api: { disputes: { mine: (...a: unknown[]) => mockMine(...a) } } }))

// Focus fires on mount and again on demand — opening a dispute PUSHES the
// thread on top, so this screen is still mounted when you come back.
jest.mock('expo-router', () => {
  const React = require('react')
  const { registerFocus } = require('@/hooks/__fixtures__/focus')
  return { useFocusEffect: (cb: () => void) => React.useEffect(() => registerFocus(cb), [cb]) }
})

import { useMyDisputes } from '@/hooks/useMyDisputes'
import { refocus, resetFocus } from '@/hooks/__fixtures__/focus'

afterEach(() => resetFocus())

function row(id: string): MyDisputeRow {
  return {
    dispute_id: id,
    escrow_id: `e-${id}`,
    kind: 'gig',
    subject_title: 'Paint the fence',
    status: 'disputed',
    my_role: 'creator',
    counterparty_name: 'Ben Worker',
    reason: 'never showed up',
    raised_at: '2026-07-01T00:00:00.000Z',
    winner: null,
    resolved_at: null,
    raised_by_me: true,
  }
}

beforeEach(() => mockMine.mockReset())

test('loads open disputes on mount', async () => {
  mockMine.mockResolvedValue({ data: [row('d1')], total: 1, limit: 20, offset: 0 })
  const { result } = renderHook(() => useMyDisputes('open'))
  expect(result.current.isLoading).toBe(true)
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.items).toHaveLength(1)
  expect(result.current.error).toBeNull()
  expect(mockMine).toHaveBeenCalledWith({ status: 'open', limit: 20, offset: 0 })
})

test('surfaces an error message and leaves the list empty', async () => {
  mockMine.mockRejectedValue(new Error('network down'))
  const { result } = renderHook(() => useMyDisputes('open'))
  await waitFor(() => expect(result.current.error).toBe('network down'))
  expect(result.current.items).toEqual([])
  expect(result.current.isLoading).toBe(false)
})

test('refetches when the status segment changes', async () => {
  mockMine.mockResolvedValue({ data: [row('d9')], total: 1, limit: 20, offset: 0 })
  const { result, rerender } = renderHook(({ s }: { s: 'open' | 'resolved' }) => useMyDisputes(s), {
    initialProps: { s: 'open' },
  })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  rerender({ s: 'resolved' })
  await waitFor(() => expect(mockMine).toHaveBeenLastCalledWith({ status: 'resolved', limit: 20, offset: 0 }))
})

test('a slow stale response never overwrites the latest segment', async () => {
  // First (open) request resolves LATE; second (resolved) resolves first.
  let resolveOpen: (v: unknown) => void = () => {}
  const openPending = new Promise((res) => {
    resolveOpen = res
  })
  mockMine.mockImplementationOnce(() => openPending) // open
  mockMine.mockResolvedValueOnce({ data: [row('resolved-1')], total: 1, limit: 20, offset: 0 }) // resolved

  const { result, rerender } = renderHook(({ s }: { s: 'open' | 'resolved' }) => useMyDisputes(s), {
    initialProps: { s: 'open' },
  })
  rerender({ s: 'resolved' })
  await waitFor(() => expect(result.current.items).toHaveLength(1))
  expect(result.current.items[0].dispute_id).toBe('resolved-1')

  // The stale 'open' batch now lands — it must be ignored.
  resolveOpen({ data: [row('open-STALE')], total: 1, limit: 20, offset: 0 })
  await new Promise((r) => setTimeout(r, 0))
  expect(result.current.items[0].dispute_id).toBe('resolved-1')
})

test('a later focus re-reads the list, so a resolved dispute leaves the Open bucket', async () => {
  mockMine.mockResolvedValue({ data: [row('d1')], total: 1, limit: 20, offset: 0 })
  const { result } = renderHook(() => useMyDisputes('open'))
  await waitFor(() => expect(mockMine).toHaveBeenCalledTimes(1))

  // Resolve it from the thread, then come back: the screen never unmounted,
  // so without a re-read the row stayed under Open.
  mockMine.mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
  await act(async () => { refocus() })

  await waitFor(() => expect(result.current.items).toHaveLength(0))
  expect(mockMine).toHaveBeenCalledTimes(2)
  expect(mockMine).toHaveBeenLastCalledWith({ status: 'open', limit: 20, offset: 0 })
})

test('the focus re-read follows the ACTIVE segment, not the one mounted with', async () => {
  mockMine.mockResolvedValue({ data: [row('d1')], total: 1, limit: 20, offset: 0 })
  const { rerender } = renderHook(({ s }: { s: 'open' | 'resolved' }) => useMyDisputes(s), {
    initialProps: { s: 'open' },
  })
  await waitFor(() => expect(mockMine).toHaveBeenCalledTimes(1))

  rerender({ s: 'resolved' })
  await waitFor(() => expect(mockMine).toHaveBeenCalledTimes(2))

  await act(async () => { refocus() })
  // The controller holds the query in a ref, so the re-read picks up the
  // segment on screen rather than the one captured at mount.
  await waitFor(() => expect(mockMine).toHaveBeenCalledTimes(3))
  expect(mockMine).toHaveBeenLastCalledWith({ status: 'resolved', limit: 20, offset: 0 })
})

test('the focus re-read is silent — no skeleton over a list already on screen', async () => {
  mockMine.mockResolvedValue({ data: [row('d1')], total: 1, limit: 20, offset: 0 })
  const { result } = renderHook(() => useMyDisputes('open'))
  await waitFor(() => expect(mockMine).toHaveBeenCalledTimes(1))

  mockMine.mockImplementation(() => new Promise(() => {})) // never settles
  await act(async () => { refocus() })
  expect(result.current.isLoading).toBe(false)
  expect(result.current.isRefreshing).toBe(false)
  expect(result.current.items).toHaveLength(1)
})

test('the FIRST focus does not double-fetch', async () => {
  // Page 0 is owned by the controller's query effect; a focus effect that
  // fetched unconditionally would make every cold open two requests.
  mockMine.mockResolvedValue({ data: [row('d1')], total: 1, limit: 20, offset: 0 })
  renderHook(() => useMyDisputes('open'))
  await waitFor(() => expect(mockMine).toHaveBeenCalledTimes(1))

  await new Promise((r) => setTimeout(r, 20))
  expect(mockMine).toHaveBeenCalledTimes(1)
})

test('a focus after a failed first load retries rather than staying broken', async () => {
  mockMine.mockRejectedValue(new Error('network down'))
  const { result } = renderHook(() => useMyDisputes('open'))
  await waitFor(() => expect(result.current.error).toBe('network down'))

  // `hasFetched` is set even on failure, so the screen recovers on refocus.
  mockMine.mockResolvedValue({ data: [row('d1')], total: 1, limit: 20, offset: 0 })
  await act(async () => { refocus() })
  await waitFor(() => expect(result.current.items).toHaveLength(1))
})

test('paginates, de-duplicating a shifted window', async () => {
  mockMine
    .mockResolvedValueOnce({ data: [row('d1'), row('d2')], total: 3, limit: 20, offset: 0 })
    .mockResolvedValueOnce({ data: [row('d2'), row('d3')], total: 3, limit: 20, offset: 2 })
  const { result } = renderHook(() => useMyDisputes('open'))
  await waitFor(() => expect(result.current.items).toHaveLength(2))

  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toHaveLength(3))
  expect(result.current.items.map((r) => r.dispute_id)).toEqual(['d1', 'd2', 'd3'])
})
