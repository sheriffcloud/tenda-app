/**
 * Profile counts as server COUNTs: each stat is `limit: 1` with the
 * answer read off `total`, "Posted" excludes drafts by query, and the
 * generation guard drops superseded responses on an account switch.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { POSTED_ESCROW_STATUSES, type GigListQuery } from '@tenda/shared'

const gigsApi = vi.hoisted(() => ({
  list: vi.fn<(q?: GigListQuery) => Promise<{ data: never[]; total: number; limit: number; offset: number }>>(),
}))
const usersApi = vi.hoisted(() => ({ reviews: vi.fn() }))
vi.mock('@/api/client', () => ({ api: { gigs: gigsApi, users: usersApi } }))

import { useProfileStats } from '@/hooks/profile/useProfileStats'

beforeEach(() => {
  vi.clearAllMocks()
  usersApi.reviews.mockResolvedValue({ data: [], total: 0, limit: 1, offset: 0 })
})

test('reads four limit-1 counts; posted excludes drafts by construction', async () => {
  gigsApi.list.mockImplementation(async (q) => ({
    data: [],
    total: q?.mine === 'working' ? 4 : Array.isArray(q?.status) && q.status.length > 3 ? 9 : 2,
    limit: 1,
    offset: 0,
  }))
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  expect(result.current.posted).toBe(9)
  expect(result.current.active).toBe(2)
  expect(result.current.completed).toBe(4)

  for (const [q] of gigsApi.list.mock.calls) {
    expect(q?.limit).toBe(1)
  }
  const postedQuery = gigsApi.list.mock.calls.map(([q]) => q).find((q) => Array.isArray(q?.status) && q.status.length > 3)
  expect(postedQuery?.status).toEqual([...POSTED_ESCROW_STATUSES])
  expect(postedQuery?.status).not.toContain('draft')
})

test('reads the review count the same way — smallest page, answer off `total`', async () => {
  gigsApi.list.mockResolvedValue({ data: [], total: 0, limit: 1, offset: 0 })
  usersApi.reviews.mockResolvedValue({ data: [], total: 37, limit: 1, offset: 0 })
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  expect(result.current.reviews).toBe(37)
  // Never a page of rows counted client-side.
  expect(usersApi.reviews).toHaveBeenCalledWith({ id: 'me' }, { limit: 1 })
})

test('a failed review count does not take the gig counts down with it', async () => {
  gigsApi.list.mockResolvedValue({ data: [], total: 5, limit: 1, offset: 0 })
  usersApi.reviews.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.reviews).toBe(0)
  // The point of the test: three good numbers are not lost because a
  // supplementary fourth was unavailable.
  expect(result.current.posted).toBe(5)
  expect(result.current.completed).toBe(5)
})

test('no user id → no requests, and the hook stays idle', async () => {
  const { result } = renderHook(() => useProfileStats(undefined))
  await Promise.resolve()
  expect(gigsApi.list).not.toHaveBeenCalled()
  expect(result.current.status).toBe('idle')
})

test('a failed count load is ERROR, never a zero presented as an answer', async () => {
  // The bug this test used to document the opposite of. Its predecessor
  // asserted `posted === 0` with the comment "kept, not an error screen",
  // which described behaviour the code did not have: the counts were zeroed
  // a few lines before the request, so a failure published those zeros with
  // loaded=true and the profile stated them as fact.
  gigsApi.list.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useProfileStats('me'))

  await waitFor(() => expect(result.current.status).toBe('error'))
  // Distinguishable from a genuine zero, which is the whole point: an account
  // that really has posted nothing reports the SAME numbers under 'ready'.
  expect(result.current.status).not.toBe('ready')
})

test("a genuine zero is READY — the failure state must not swallow real zeroes", async () => {
  gigsApi.list.mockResolvedValue({ data: [], total: 0, limit: 1, offset: 0 })
  const { result } = renderHook(() => useProfileStats('me'))

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(0)
  expect(result.current.completed).toBe(0)
})

test('reload retries after a failure and can reach ready', async () => {
  // The affordance the profile now offers. Without this the error state is a
  // dead end, which is why leaving `loaded` false was rejected as the fix.
  gigsApi.list.mockRejectedValue(new Error('down'))
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('error'))

  gigsApi.list.mockResolvedValue({ data: [], total: 7, limit: 1, offset: 0 })
  act(() => result.current.reload())

  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(7)
})

// ---------- superseded reads --------------------------------------------------

test('a stale response never lands on the account that replaced it', async () => {
  // The guard AFTER the fetch. Mobile's twin has covered this since it was
  // written; web's had not, and it is the same defect class as #45 — an
  // in-flight response repopulating state that has since moved on.
  let answerFirst: ((v: { data: never[]; total: number; limit: number; offset: number }) => void) | undefined
  gigsApi.list.mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
  gigsApi.list.mockResolvedValue({ data: [], total: 7, limit: 1, offset: 0 })

  const { result, rerender } = renderHook(({ id }: { id: string }) => useProfileStats(id), {
    initialProps: { id: 'first' },
  })
  // Wait for the first account's round to actually START. Switching before
  // that is a different path — the PRE-fetch guard drops the queued reload and
  // no request is ever made, so the hanging answer would land on the second
  // account instead of the abandoned one.
  await waitFor(() => expect(gigsApi.list).toHaveBeenCalled())

  rerender({ id: 'second' })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.posted).toBe(7)

  // The abandoned account answers last, with a different number.
  await act(async () => {
    answerFirst?.({ data: [], total: 999, limit: 1, offset: 0 })
  })

  expect(result.current.posted).toBe(7)
  expect(result.current.status).toBe('ready')
})

test('two retries in a row fire ONE round of counts, not two', async () => {
  // The guard BEFORE the fetch: each reload defers by a microtask, so a second
  // click supersedes the first while it is still queued. Without it a
  // double-tapped "Try again" doubles every request and can blank freshly
  // settled counts back to loading.
  gigsApi.list.mockResolvedValue({ data: [], total: 1, limit: 1, offset: 0 })
  const { result } = renderHook(() => useProfileStats('me'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  const afterMount = gigsApi.list.mock.calls.length

  await act(async () => {
    result.current.reload()
    result.current.reload()
  })
  await waitFor(() => expect(result.current.status).toBe('ready'))

  // Three gig counts per round — one round, not two.
  expect(gigsApi.list.mock.calls.length - afterMount).toBe(3)
})
