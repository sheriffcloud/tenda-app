/**
 * The unclaimed-dispute badge, and the sidebar wiring that decides whether it
 * exists at all.
 *
 * Four things, each with a failure mode this component alone can produce:
 *
 *   THE QUERY — a badge that counted every open dispute rather than the
 *   unclaimed ones looks entirely plausible and is wrong in the direction that
 *   matters, reading as "nobody is on these" when somebody is.
 *
 *   WHAT ABSENCE MEANS — zero, not-yet-known and failed-to-load all render as
 *   nothing, and the distinction between "the queue is empty" and "we cannot
 *   reach the API" is the one a badge must never blur.
 *
 *   THE ACCESSIBLE NAME — a bare digit reads as nothing aloud, and the role it
 *   hangs on decides whether the label exists at all.
 *
 *   THE PERMISSION GATE — structural rather than a check in this file: the
 *   badge is gated by living inside a nav item `visibleNav` may not emit, so
 *   nothing in the component itself would catch a regression that moved it out
 *   of that loop.
 *
 * SCHEDULING is `usePolledCount`'s and is tested there. Two tests here do move
 * the clock, and neither is a restatement of it: one pins the 30s DoD figure to
 * this component's own constant, the other exercises a second poll only because
 * "an outage after a count arrived" is unreachable without one.
 */
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { AppSidebar } from '@/components/layout/sidebar'
import { DisputeQueueBadge, DISPUTE_QUEUE_POLL_MS } from '@/components/layout/dispute-queue-badge'
import { adminApi } from '@/api/client'
import { setSession } from '@/lib/auth'
import { renderPage } from '../test-utils'
import type { DisputeSummary, PaginatedResponse } from '@tenda/shared'

vi.mock('@/api/client', () => ({
  adminApi: { disputes: { list: vi.fn() } },
}))

const listFn = vi.mocked(adminApi.disputes.list)

/** Only `total` is read; the rows are the part the badge deliberately ignores. */
function page(total: number): PaginatedResponse<DisputeSummary> {
  return { data: [], total, limit: 1, offset: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // Never settles by default. A promise that auto-resolves lands its state
  // update after the test body has already finished, which React reports as an
  // un-acted update — noise that would eventually hide a real one. Tests that
  // want a response ask for one, through `controlledList` or an explicit mock
  // they then await.
  listFn.mockImplementation(() => new Promise<PaginatedResponse<DisputeSummary>>(() => {}))
})

afterEach(() => {
  localStorage.clear()
})

/**
 * Hand the badge a response the test settles itself, and settle it inside
 * `act`.
 *
 * The obvious alternative — `mockResolvedValue` plus `waitFor(() =>
 * expect(listFn).toHaveBeenCalled())` — is a trap, and it caught me: the
 * fetcher is called SYNCHRONOUSLY on mount, so that `waitFor` returns on its
 * first attempt, before the promise has resolved and before any state has been
 * applied. Every assertion after it then runs against `count === null`, which
 * is indistinguishable from "the component chose to render nothing".
 *
 * Measured, not assumed: with that shape, a badge that renders a literal `0`
 * for an empty queue passed the "renders NOTHING, not a zero" test.
 */
function controlledList() {
  let resolveWith: (page: PaginatedResponse<DisputeSummary>) => void = () => {}
  let rejectWith: (err: Error) => void = () => {}
  listFn.mockImplementation(
    () =>
      new Promise<PaginatedResponse<DisputeSummary>>((resolve, reject) => {
        resolveWith = resolve
        rejectWith = reject
      }),
  )
  return {
    settle: async (total: number) => {
      await act(async () => {
        resolveWith(page(total))
      })
    },
    fail: async (err: Error) => {
      await act(async () => {
        rejectWith(err)
      })
    },
  }
}

// `renderPage` (test/test-utils) already supplies the SidebarProvider every
// sidebar primitive needs. Hand-rolling the wrapper here would be a third copy
// of it in the suite.
function renderBadge() {
  return renderPage(
    <ul>
      <li>
        <DisputeQueueBadge />
      </li>
    </ul>,
  )
}

function renderSidebarAs(role: string) {
  setSession('jwt', { id: 'u1', role, first_name: 'A', last_name: 'B' })
  return renderPage(<AppSidebar />)
}

// ── the query ────────────────────────────────────────────────────────────────

test('counts the UNCLAIMED open disputes, not every open one', async () => {
  // The filter pair is the whole point. Dropping `assigned: 'none'` would show
  // the entire open caseload — including everything already being worked — and
  // the badge would read as "nobody is on these" when somebody is.
  renderBadge()

  expect(listFn).toHaveBeenCalledWith({ status: 'open', assigned: 'none', limit: 1 })
})

test('polls again on the declared interval', async () => {
  // The one DoD requirement nothing else here touches: "polling every 30s".
  //
  // TWO assertions, because either alone has a hole. Advancing by the constant
  // proves the badge honours whatever it declares, but is blind to the constant
  // itself changing — measured: widening it 100x left every test green. The
  // literal below is therefore deliberate duplication, and it is the point:
  // 30s is a decision, so changing it should have to be typed twice.
  expect(DISPUTE_QUEUE_POLL_MS).toBe(30_000)

  vi.useFakeTimers()
  try {
    const list = controlledList()
    renderBadge()
    await list.settle(2)
    expect(listFn).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DISPUTE_QUEUE_POLL_MS - 1)
    })
    expect(listFn).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(listFn).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

// ── what it renders ──────────────────────────────────────────────────────────

test('shows the count once it arrives', async () => {
  listFn.mockResolvedValue(page(4))
  renderBadge()

  expect(await screen.findByText('4')).toBeInTheDocument()
})

test('renders nothing before the first response', () => {
  // A "0" flashing on every page load would train admins to ignore the badge.
  const { container } = renderBadge()
  expect(container.querySelector('[data-slot="sidebar-menu-badge"]')).toBeNull()
})

test('an empty queue renders NOTHING, not a zero', async () => {
  // A permanent "0" on a nav item that is fine would train admins to stop
  // reading the badge, which costs exactly what the badge is for.
  const list = controlledList()
  const { container } = renderBadge()

  await list.settle(0)

  expect(container.querySelector('[data-slot="sidebar-menu-badge"]')).toBeNull()
  expect(screen.queryByText('0')).toBeNull()
})

test('a failure on the FIRST poll leaves the badge absent, not zero', async () => {
  // An unreachable API is not an empty queue — but it is not a count either.
  // Nothing is the only honest render before any total has ever arrived.
  const list = controlledList()
  const { container } = renderBadge()

  await list.fail(new Error('network down'))

  expect(container.querySelector('[data-slot="sidebar-menu-badge"]')).toBeNull()
})

test('a failure AFTER a count keeps showing it rather than dropping to nothing', async () => {
  // The claim this component's own doc comment makes, and until now made
  // nowhere else: an outage must not silently redraw a queue of 5 as empty.
  // Only reachable through a second poll, so it needs the timers.
  vi.useFakeTimers()
  try {
    const list = controlledList()
    renderBadge()
    await list.settle(5)
    expect(screen.getByText('5')).toBeInTheDocument()

    const next = controlledList()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DISPUTE_QUEUE_POLL_MS)
    })

    // CONTROL. `next.fail` rejects whatever promise the second call created —
    // so if no second call ever happened it rejects nothing, the badge still
    // reads 5 from the first poll, and the assertion below passes for entirely
    // the wrong reason. This is the check that the failure being asserted
    // actually occurred.
    expect(listFn).toHaveBeenCalledTimes(2)
    await next.fail(new Error('network down'))

    expect(screen.getByText('5')).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

test('the number carries a label on a role that can actually hold one', async () => {
  // Queried BY ROLE, not by label, and that distinction is the test. A bare
  // <div> maps to ARIA `generic`, which prohibits naming from the author, so an
  // `aria-label` there is ignored by real screen readers. jsdom's
  // accessible-name implementation does not model the prohibition — measured:
  // deleting `role="status"` left `findByLabelText` passing — so a label query
  // cannot tell an effective label from a dead one. A role query can.
  listFn.mockResolvedValue(page(3))
  renderBadge()

  expect(await screen.findByRole('status', { name: '3 unclaimed disputes' })).toBeInTheDocument()
})

test('one dispute is singular', async () => {
  listFn.mockResolvedValue(page(1))
  renderBadge()

  expect(await screen.findByRole('status', { name: '1 unclaimed dispute' })).toBeInTheDocument()
})

// ── the permission gate ──────────────────────────────────────────────────────

test('a dispute_admin sees the badge ON the Disputes item, not merely somewhere', async () => {
  // Scoped with `within`, because "the count appears in the sidebar" is a
  // weaker claim than the name makes and would hold with the badge hoisted
  // anywhere at all — including into the header, which is exactly the
  // regression that breaks the permission gate.
  listFn.mockResolvedValue(page(2))
  renderSidebarAs('dispute_admin')
  await screen.findByText('2')

  const item = screen.getByText('Disputes').closest('li')
  if (item === null) throw new Error('the Disputes nav item is not inside a list item')
  expect(within(item).getByRole('status')).toHaveTextContent('2')
})

test('a role without disputes.read never even asks for the count', async () => {
  // The request would 403, every 30 seconds, for as long as the tab is open.
  // The gate is that the badge lives inside a nav item `visibleNav` did not
  // emit — so this fails the moment it is hoisted out of that loop.
  renderSidebarAs('user')

  expect(screen.queryByText('Disputes')).toBeNull()
  expect(listFn).not.toHaveBeenCalled()
})

test('a logged-out sidebar polls nothing', () => {
  // Deliberately NOT `renderSidebarAs` — that helper sets a session, and the
  // whole point here is that there isn't one.
  renderPage(<AppSidebar />)

  expect(listFn).not.toHaveBeenCalled()
})
