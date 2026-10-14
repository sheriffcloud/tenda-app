/**
 * The profile's "Work you have done" chips.
 *
 * Two things are worth more than the happy path here. The block must render
 * NOTHING when there is nothing — a new account reading "Delivery 0 · Creative
 * 0" is the failure this replaces — and the counts must come off the endpoint
 * rather than being grouped from a page of gigs, which is the whole reason the
 * endpoint exists (#33).
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { CATEGORY_LABELS } from '@tenda/shared'
import type { CompletedWorkResponse } from '@tenda/shared'

const { completedWorkMock, gigsListMock } = vi.hoisted(() => ({
  completedWorkMock: vi.fn<(p: { id: string }) => Promise<CompletedWorkResponse>>(),
  gigsListMock: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  api: { users: { completedWork: completedWorkMock }, gigs: { list: gigsListMock } },
}))

import { CompletedWork } from '@/components/profile'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../../test/factories/user'

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser({ id: 'me' }), isAuthenticated: true })
})

function serves(data: CompletedWorkResponse['data']): void {
  completedWorkMock.mockResolvedValue({ data })
}

// ---------- what it draws ---------------------------------------------------

test('a chip per category, labelled and counted, in the order served', async () => {
  serves([
    { category: 'delivery', count: 3 },
    { category: 'photo', count: 2 },
  ])
  render(<CompletedWork userId="me" />)

  const chips = await screen.findAllByRole('listitem')
  // The shared label, not the raw key: 'photo' reads "Creative" product-wide.
  expect(chips.map((chip) => chip.textContent)).toEqual([
    `${CATEGORY_LABELS.delivery}3`,
    `${CATEGORY_LABELS.photo}2`,
  ])
})

test('the count is the SERVER total, not a page of rows', async () => {
  // 137 is past any page size this app asks for. A block that grouped the
  // user's gigs client-side could only ever show the size of the page it got,
  // so this number is only renderable by an aggregate.
  serves([{ category: 'errand', count: 137 }])
  render(<CompletedWork userId="me" />)

  expect(await screen.findByText('137')).toBeInTheDocument()
  expect(completedWorkMock).toHaveBeenCalledWith({ id: 'me' })
  // And nothing paged the feed to get there.
  expect(gigsListMock).not.toHaveBeenCalled()
})

// ---------- when there is nothing to draw ----------------------------------

test('renders NOTHING when no work is completed — never a row of zeros', async () => {
  serves([])
  const { container } = render(<CompletedWork userId="me" />)

  await waitFor(() => expect(completedWorkMock).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})

test('a failed read hides the block rather than blanking the profile', async () => {
  completedWorkMock.mockRejectedValue(new Error('offline'))
  const { container } = render(<CompletedWork userId="me" />)

  await waitFor(() => expect(completedWorkMock).toHaveBeenCalled())
  expect(container).toBeEmptyDOMElement()
})

// ---------- whose work it is ------------------------------------------------

test('reads "Work you have done" on your own profile', async () => {
  serves([{ category: 'service', count: 1 }])
  render(<CompletedWork userId="me" />)

  expect(await screen.findByRole('heading', { name: 'Work you have done' })).toBeInTheDocument()
})

test('reads "Work completed" when the reader is someone else', async () => {
  // The comp's copy is written for your own profile; the same block is on
  // /profile/[id], where "you have done" would be about the wrong person.
  serves([{ category: 'service', count: 1 }])
  render(<CompletedWork userId="them" />)

  expect(await screen.findByRole('heading', { name: 'Work completed' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Work you have done' })).not.toBeInTheDocument()
})

test('an anonymous reader gets the third-person heading, not yours', async () => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
  serves([{ category: 'digital', count: 4 }])
  render(<CompletedWork userId="them" />)

  expect(await screen.findByRole('heading', { name: 'Work completed' })).toBeInTheDocument()
})

// ---------- moving between profiles ----------------------------------------

test('a profile left before the fetch starts never asks for it', async () => {
  // The guard before the request, not the one after it: the effect defers by a
  // microtask, so a reader who passes straight through a profile has already
  // gone by the time it would fire. Firing anyway is a request nobody reads.
  serves([{ category: 'delivery', count: 1 }])
  const { unmount } = render(<CompletedWork userId="passing-through" />)
  unmount()

  // Flush, THEN assert. `waitFor` on a negative passes on its first check, so
  // it would return before the deferred effect body had a chance to fire and
  // the test would hold with the guard removed.
  await act(async () => {
    await Promise.resolve()
  })
  expect(completedWorkMock).not.toHaveBeenCalled()
})

test('a SLOW first profile cannot land its chips on the second', async () => {
  // The other order, and the one that actually loses a race: profile A is
  // still in flight when the reader opens B, and A answers last. Without the
  // cancelled guard A's chips overwrite B's and stay there, on a page that
  // names someone else.
  let answerFirst: (value: CompletedWorkResponse) => void = () => {}
  completedWorkMock.mockReturnValueOnce(
    new Promise<CompletedWorkResponse>((resolve) => {
      answerFirst = resolve
    }),
  )
  const { rerender } = render(<CompletedWork userId="slow" />)
  // Wait for the FIRST call to actually take the pending promise. The fetch
  // happens a microtask after render, so queueing the second answer before
  // this hands the pending promise to the wrong profile.
  await waitFor(() => expect(completedWorkMock).toHaveBeenCalledWith({ id: 'slow' }))

  serves([{ category: 'service', count: 2 }])
  rerender(<CompletedWork userId="fast" />)
  expect(await screen.findByText('2')).toBeInTheDocument()

  // The abandoned request finally answers. It must change nothing.
  answerFirst({ data: [{ category: 'errand', count: 99 }] })
  await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
  expect(screen.queryByText('99')).not.toBeInTheDocument()
  expect(screen.getByText(CATEGORY_LABELS.service)).toBeInTheDocument()
})

test("one profile's chips never show as the next profile's", async () => {
  serves([{ category: 'delivery', count: 9 }])
  const { rerender } = render(<CompletedWork userId="them" />)
  expect(await screen.findByText('9')).toBeInTheDocument()

  // The next profile's answer has not arrived yet. Until it does the block has
  // to be empty — showing 9 under a different name is worse than showing none.
  let resolveNext: (value: CompletedWorkResponse) => void = () => {}
  completedWorkMock.mockReturnValue(
    new Promise<CompletedWorkResponse>((resolve) => {
      resolveNext = resolve
    }),
  )
  rerender(<CompletedWork userId="someone-else" />)

  await waitFor(() => expect(screen.queryByText('9')).not.toBeInTheDocument())

  resolveNext({ data: [{ category: 'photo', count: 1 }] })
  expect(await screen.findByText('1')).toBeInTheDocument()
})
