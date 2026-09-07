/**
 * DoD assertion (stage 6): drafts appear only under drafts and "Posted"
 * excludes them BY QUERY — the posted list asks the server for
 * POSTED_ESCROW_STATUSES exactly (no 'draft'), the drafts list for
 * ['draft'] exactly, so no client-side arithmetic can ever mix them.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { POSTED_ESCROW_STATUSES, type GigListQuery } from '@tenda/shared'

const gigsApi = vi.hoisted(() => ({
  list: vi.fn<(q?: GigListQuery) => Promise<{ data: never[]; total: number; limit: number; offset: number }>>(),
}))
const applicationsApi = vi.hoisted(() => ({
  mine: vi.fn(() => Promise.resolve({ data: [], total: 0, limit: 20, offset: 0 })),
}))

vi.mock('@/api/client', () => ({ api: { gigs: gigsApi, applications: applicationsApi } }))

// The personal-change signal these lists listen to.
const realtime = vi.hoisted(() => ({ listeners: new Set<() => void>(), connected: true }))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) =>
    select({ connected: realtime.connected }),
  onPersonalEvent: (listener: () => void) => {
    realtime.listeners.add(listener)
    return () => { realtime.listeners.delete(listener) }
  },
}))

import { useMyGigs } from '@/hooks/gig/useMyGigs'
import { useAuthStore } from '@/stores/auth.store'
import { LIST_BURST_DEBOUNCE_MS } from '@tenda/shared'
import { makeUser } from '../../../test/factories/user'

beforeEach(() => {
  vi.clearAllMocks()
  gigsApi.list.mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
  realtime.listeners.clear()
  realtime.connected = true
})

test('posted asks for POSTED_ESCROW_STATUSES (never draft); drafts asks for draft only', async () => {
  renderHook(() => useMyGigs())
  await waitFor(() => expect(gigsApi.list.mock.calls.length).toBeGreaterThanOrEqual(3))

  const queries = gigsApi.list.mock.calls.map(([q]) => q)
  const posted = queries.find((q) => Array.isArray(q?.status) && q.status.length > 1)
  const drafts = queries.find((q) => Array.isArray(q?.status) && q.status.length === 1)
  const working = queries.find((q) => q?.mine === 'working')

  expect(posted?.mine).toBe('created')
  expect(posted?.status).toEqual([...POSTED_ESCROW_STATUSES])
  expect(posted?.status).not.toContain('draft')

  expect(drafts?.mine).toBe('created')
  expect(drafts?.status).toEqual(['draft'])

  expect(working?.status).toBeUndefined() // working = every status on that side
})

test('nothing fires before the session user loads', async () => {
  useAuthStore.setState({ user: null })
  renderHook(() => useMyGigs())
  await Promise.resolve()
  expect(gigsApi.list).not.toHaveBeenCalled()
  expect(applicationsApi.mine).not.toHaveBeenCalled()
})


/**
 * All four lists refresh on one personal signal, because an inactive tab's
 * count chip is a real server total (this hook's header) — leaving three stale
 * puts a WRONG NUMBER on screen, not merely an old list, and the reader cannot
 * tell the difference.
 */
test('a personal event revalidates every list, not only the visible one', async () => {
  vi.useFakeTimers()
  try {
    renderHook(() => useMyGigs())
    // `act` rather than `waitFor`: the mount fetches resolve into React state.
    await act(async () => {})
    expect(gigsApi.list.mock.calls.length).toBeGreaterThanOrEqual(3)
    const gigCallsBefore = gigsApi.list.mock.calls.length
    const applicationCallsBefore = applicationsApi.mine.mock.calls.length

    // What the socket does when a notification lands.
    act(() => { for (const listener of [...realtime.listeners]) listener() })
    await act(async () => { vi.advanceTimersByTime(LIST_BURST_DEBOUNCE_MS) })

    // posted + working + drafts, and applications on its own endpoint.
    expect(gigsApi.list.mock.calls.length).toBe(gigCallsBefore + 3)
    expect(applicationsApi.mine.mock.calls.length).toBe(applicationCallsBefore + 1)
  } finally {
    vi.useRealTimers()
  }
})
