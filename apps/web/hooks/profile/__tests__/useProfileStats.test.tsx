/**
 * Profile counts from ONE overview read (`GET /v1/users/me/overview`): the
 * figures come straight off the server, a failure is `error` and never a zero
 * presented as an answer, and the generation guard drops superseded responses
 * on an account switch.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { MyOverviewResponse } from '@tenda/shared'

const usersApi = vi.hoisted(() => ({ myOverview: vi.fn<() => Promise<MyOverviewResponse>>() }))
vi.mock('@/api/client', () => ({ api: { users: usersApi } }))

import { useProfileStats } from '@/hooks/profile/useProfileStats'

function overview(stats: Partial<MyOverviewResponse['stats']> = {}): MyOverviewResponse {
  return { stats: { posted: 0, active: 0, completed: 0, reviews: 0, ...stats }, open_disputes: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('reads all four figures from a single request', async () => {
  usersApi.myOverview.mockResolvedValue(overview({ posted: 9, active: 2, completed: 4, reviews: 37 }))
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  expect(result.current.posted).toBe(9)
  expect(result.current.active).toBe(2)
  expect(result.current.completed).toBe(4)
  expect(result.current.reviews).toBe(37)
  expect(usersApi.myOverview).toHaveBeenCalledTimes(1)
})

test('no user id → no requests, and the hook stays idle', async () => {
  const { result } = renderHook(() => useProfileStats(undefined))
  await Promise.resolve()
  expect(usersApi.myOverview).not.toHaveBeenCalled()
  expect(result.current.status).toBe('idle')
})

test('a failed load is ERROR, never a zero presented as an answer', async () => {
  usersApi.myOverview.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useProfileStats('me'))

  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.status).not.toBe('ready')
})

test('a genuine zero is READY — the failure state must not swallow real zeroes', async () => {
  usersApi.myOverview.mockResolvedValue(overview())
  const { result } = renderHook(() => useProfileStats('me'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(0)
  expect(result.current.completed).toBe(0)
})

test('reload retries after a failure and can reach ready', async () => {
  usersApi.myOverview.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('error'))

  usersApi.myOverview.mockResolvedValue(overview({ posted: 7 }))
  act(() => result.current.reload())

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(7)
})

// ---------- superseded reads --------------------------------------------------

test('a stale response never lands on the account that replaced it', async () => {
  let answerFirst: ((v: MyOverviewResponse) => void) | undefined
  usersApi.myOverview.mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
  usersApi.myOverview.mockResolvedValue(overview({ posted: 7 }))

  const { result, rerender } = renderHook(({ id }: { id: string }) => useProfileStats(id), {
    initialProps: { id: 'first' },
  })
  // Wait for the first account's round to actually START: switching before
  // that drops the queued reload and no request is ever made, so the hanging
  // answer would land on the second account instead of the abandoned one.
  await waitFor(() => expect(usersApi.myOverview).toHaveBeenCalled())

  rerender({ id: 'second' })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(7)

  await act(async () => {
    answerFirst?.(overview({ posted: 999 }))
  })

  expect(result.current.posted).toBe(7)
  expect(result.current.status).toBe('ready')
})

test('two retries in a row fire ONE request, not two', async () => {
  // Each reload defers by a microtask, so a second click supersedes the first
  // while it is still queued; a double-tapped "Try again" must not double the
  // request or blank freshly settled counts back to loading.
  usersApi.myOverview.mockResolvedValue(overview({ posted: 1 }))
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  const afterMount = usersApi.myOverview.mock.calls.length

  await act(async () => {
    result.current.reload()
    result.current.reload()
  })
  await waitFor(() => expect(result.current.status).toBe('ready'))

  expect(usersApi.myOverview.mock.calls.length - afterMount).toBe(1)
})
