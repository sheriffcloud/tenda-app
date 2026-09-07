/**
 * useMyGigs — all three tabs load on mount so no count chip reads 0 until its
 * tab is opened (open_issues MB2), Posted excludes drafts while Drafts keeps
 * them reachable, the chain filter applies to every tab, and all re-read on a
 * later focus so a tab that never unmounts can't serve stale rows.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockList = jest.fn()
jest.mock('@/api/client', () => ({ api: { gigs: { list: (...a: unknown[]) => mockList(...a) } } }))

const mockUser = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockUser() }),
}))

// Focus fires on mount and again on demand — My Gigs is a tab, so the SECOND
// focus is the case that matters.
jest.mock('expo-router', () => {
  const React = require('react')
  const { registerFocus } = require('@/hooks/__fixtures__/focus')
  return { useFocusEffect: (cb: () => void) => React.useEffect(() => registerFocus(cb), [cb]) }
})

import { useMyGigs } from '@/hooks/useMyGigs'
import { refocus, resetFocus } from '@/hooks/__fixtures__/focus'

afterEach(() => resetFocus())

/** Every list is one request, so a full round of the screen is three. */
const ROUND = 3

interface ListQuery {
  mine: string
  status?: string[]
  chain_id?: string
  offset: number
}

/** Which of the three lists a request belongs to, by its filter shape. */
function bucketOf(q: ListQuery): 'posted' | 'working' | 'drafts' {
  if (q.mine === 'working') return 'working'
  return q.status?.includes('draft') === true ? 'drafts' : 'posted'
}

const pageFor = (q: ListQuery) => {
  const bucket = bucketOf(q)
  if (bucket === 'working') return { data: [{ escrow_id: 'w1' }], total: 3, limit: 20, offset: 0 }
  if (bucket === 'drafts') return { data: [{ escrow_id: 'd1' }], total: 2, limit: 20, offset: 0 }
  return { data: [{ escrow_id: 'p1' }], total: 12, limit: 20, offset: 0 }
}

const queriesFrom = (from: number): ListQuery[] =>
  mockList.mock.calls.slice(from).map(([q]: [ListQuery]) => q)

beforeEach(() => {
  mockList.mockReset()
  mockUser.mockReturnValue({ id: 'user-1' })
  mockList.mockImplementation((q: ListQuery) => Promise.resolve(pageFor(q)))
})

test('loads ALL tabs on mount — the inactive counts must not read 0', async () => {
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(result.current.working.total).toBe(3))

  // Neither Posted nor Drafts was ever "the active tab" here, yet both totals
  // are populated.
  expect(result.current.posted.total).toBe(12)
  expect(result.current.drafts.total).toBe(2)
  expect(queriesFrom(0).map(bucketOf).sort()).toEqual(['drafts', 'posted', 'working'])
})

test('Posted asks for every status EXCEPT draft', async () => {
  // The bug: `mine=created` alone returns drafts too, so the Posted chip
  // counted unfunded staging rows as gigs the user had put out there.
  renderHook(() => useMyGigs())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND))

  const posted = queriesFrom(0).find((q) => bucketOf(q) === 'posted')
  expect(posted?.status).toBeDefined()
  expect(posted?.status).not.toContain('draft')
  expect(posted?.status).toEqual(expect.arrayContaining(['open', 'accepted', 'completed']))
})

test('Drafts is its own list, scoped to draft only', async () => {
  // Drafts must stay REACHABLE — this tab is the only surface that lists them.
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(result.current.drafts.items).toHaveLength(1))

  const drafts = queriesFrom(0).find((q) => bucketOf(q) === 'drafts')
  expect(drafts?.mine).toBe('created')
  expect(drafts?.status).toEqual(['draft'])
  expect(result.current.drafts.items).toEqual([{ escrow_id: 'd1' }])
})

test('the Posted and Drafts counts are separate server totals, not one split', async () => {
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(result.current.posted.hasFetched).toBe(true))
  await waitFor(() => expect(result.current.drafts.hasFetched).toBe(true))

  // Each chip is its own query's `total` — no arithmetic, so neither can
  // disagree with the rows rendered beneath it.
  expect(result.current.posted.total).toBe(12)
  expect(result.current.drafts.total).toBe(2)
})

test('counts come from the server total, not the loaded row count', async () => {
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(result.current.posted.total).toBe(12))
  // One row loaded, twelve exist — a `.length` count would say 1.
  expect(result.current.posted.items).toHaveLength(1)
})

test('the chain filter applies to every tab and resets each to page 0', async () => {
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND))

  act(() => result.current.setChainId('eip155:84532'))
  // Two of the three lists refetch — Drafts is deliberately not one of them.
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND + 2))

  const filtered = queriesFrom(ROUND)
  expect(filtered.map(bucketOf).sort()).toEqual(['posted', 'working'])
  expect(filtered.every((q) => q.chain_id === 'eip155:84532')).toBe(true)
  expect(filtered.every((q) => q.offset === 0)).toBe(true)
})

test('the chain filter does NOT scope Drafts — the banner count must not vanish', async () => {
  // Drafts no longer backs a tab, it backs a banner meaning "you have unfunded
  // work sitting here". Scoping that count to the active chip would make the
  // banner disappear on a chip tap, which reads as "my drafts are gone" rather
  // than "the filter excluded them". The drafts SCREEN filters; this count does
  // not.
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND))

  act(() => result.current.setChainId('eip155:84532'))
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND + 2))

  expect(queriesFrom(ROUND).map(bucketOf)).not.toContain('drafts')
  // And the count it already reported still stands.
  expect(result.current.drafts.total).toBe(2)
})

test('does not fetch before the signed-in user is known', async () => {
  mockUser.mockReturnValue(null)
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(result.current.posted.isLoading).toBe(false))
  expect(mockList).not.toHaveBeenCalled()
  expect(result.current.posted.hasFetched).toBe(false)
  expect(result.current.drafts.hasFetched).toBe(false)
})

test('each tab paginates independently', async () => {
  mockList.mockReset()
  mockList.mockImplementation((q: ListQuery) =>
    Promise.resolve(
      q.offset === 0
        ? { data: [{ escrow_id: `${bucketOf(q)}-1` }], total: 2, limit: 20, offset: 0 }
        : { data: [{ escrow_id: `${bucketOf(q)}-2` }], total: 2, limit: 20, offset: 1 },
    ),
  )
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(result.current.posted.items).toHaveLength(1))

  act(() => result.current.posted.loadMore())
  await waitFor(() => expect(result.current.posted.items).toHaveLength(2))
  // Paging Posted must not disturb the other tabs.
  expect(result.current.working.items).toHaveLength(1)
  expect(result.current.drafts.items).toHaveLength(1)
})

test('a later focus re-reads EVERY tab, so rows and count chips cannot go stale', async () => {
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND))

  // Publish a draft, then come back to the tab: the row moves from Drafts to
  // Posted, so refreshing only the visible list would leave a gig that is
  // already live still sitting in Drafts.
  mockList.mockImplementation((q: ListQuery) =>
    bucketOf(q) === 'posted'
      ? Promise.resolve({ data: [{ escrow_id: 'p1' }, { escrow_id: 'd1' }], total: 13, limit: 20, offset: 0 })
      : bucketOf(q) === 'drafts'
        ? Promise.resolve({ data: [], total: 1, limit: 20, offset: 0 })
        : Promise.resolve(pageFor(q)),
  )
  await act(async () => { refocus() })

  await waitFor(() => expect(result.current.posted.total).toBe(13))
  await waitFor(() => expect(result.current.drafts.total).toBe(1))
  expect(mockList).toHaveBeenCalledTimes(ROUND * 2)
  const refetched = queriesFrom(ROUND)
  expect(refetched.map(bucketOf).sort()).toEqual(['drafts', 'posted', 'working'])
  expect(refetched.every((q) => q.offset === 0)).toBe(true)
})

test('the focus re-read is silent — no skeleton over a list already on screen', async () => {
  const { result } = renderHook(() => useMyGigs())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND))

  mockList.mockImplementation(() => new Promise(() => {})) // in flight, never settles
  await act(async () => { refocus() })
  // `reload`, not `refresh`/`initial`: rows and flags stay put while it runs.
  expect(result.current.posted.isLoading).toBe(false)
  expect(result.current.posted.isRefreshing).toBe(false)
  expect(result.current.posted.items).toHaveLength(1)
  expect(result.current.drafts.isLoading).toBe(false)
  expect(result.current.drafts.items).toHaveLength(1)
})

test('the FIRST focus does not double-fetch any tab', async () => {
  // Page 0 is owned by each controller's query effect. A focus effect that
  // fetched unconditionally would make every cold open 6 requests, not 3 —
  // the exact double-fetch this screen was cleaned of.
  renderHook(() => useMyGigs())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(ROUND))

  await new Promise((r) => setTimeout(r, 20))
  expect(mockList).toHaveBeenCalledTimes(ROUND)
})

test('a focus before sign-in settles does not fetch', async () => {
  mockUser.mockReturnValue(null)
  renderHook(() => useMyGigs())
  await act(async () => { refocus() })
  // Nothing has been fetched, so there is nothing to re-read — and `mine=`
  // would 401 before the JWT is in place.
  expect(mockList).not.toHaveBeenCalled()
})

test('totals stay 0-but-unfetched until the first response, so chips can hide', async () => {
  // The screen renders a count chip only when `hasFetched` — a `total` of 0
  // during load would read as a confident "you have none".
  const { result } = renderHook(() => useMyGigs())
  expect(result.current.posted.hasFetched).toBe(false)
  expect(result.current.working.hasFetched).toBe(false)
  expect(result.current.drafts.hasFetched).toBe(false)

  await waitFor(() => expect(result.current.posted.hasFetched).toBe(true))
  await waitFor(() => expect(result.current.working.hasFetched).toBe(true))
  await waitFor(() => expect(result.current.drafts.hasFetched).toBe(true))
  expect(result.current.posted.total).toBe(12)
})
