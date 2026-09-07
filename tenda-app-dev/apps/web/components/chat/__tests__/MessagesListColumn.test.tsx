/**
 * The inbox as a list column.
 *
 * What matters here is what the column claims about the DETAIL beside it: which
 * thread is open, whether a section exists at all, and that a failed index says
 * so without taking the reader's escrows down with it.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagesListColumn } from '@/components/chat/MessagesListColumn'
import { MESSAGES_LIST_COPY } from '@/components/chat/copy'
import { LIST_ERROR_COPY } from '@/components/app/workspace/list'
import { useChatStore } from '@/stores/chat.store'
import { makeConversation } from '../../../test/factories/chat'

const fetchConversations = vi.fn<() => Promise<void>>()
let pathname = '/messages'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const bola = {
  id: 'u2',
  first_name: 'Bola',
  last_name: 'Ade',
  avatar_url: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  pathname = '/messages'
  fetchConversations.mockResolvedValue()
  // `ready` is the normal case: the layout's `useInboxRealtime` has already
  // loaded the inbox by the time any list column mounts.
  useChatStore.setState({
    conversations: [],
    conversationsStatus: 'ready',
    unread: 0,
    fetchConversations,
  })
})
afterEach(cleanup)

describe('MessagesListColumn', () => {
  const twoThreads = () =>
    useChatStore.setState({
      conversations: [
        makeConversation({ id: 'c1', unread_count: 2 }),
        makeConversation({ id: 'c2', other_user: bola }),
      ],
    })

  it('sections unread above earlier and counts the unread THREADS', async () => {
    twoThreads()
    render(<MessagesListColumn />)
    // By ROLE and name: each run of rows is named by its heading, and the
    // rows themselves also say "Unread" on their pip.
    expect(
      await screen.findByRole('list', { name: MESSAGES_LIST_COPY.unread }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: MESSAGES_LIST_COPY.earlier })).toBeInTheDocument()
    // Threads, not messages: one conversation holds two unread messages.
    expect(screen.getByText(MESSAGES_LIST_COPY.count(1))).toBeInTheDocument()
  })

  it('renders no section heading for a section with no rows', async () => {
    // An "Unread" heading over nothing reads as a list that failed to load.
    useChatStore.setState({ conversations: [makeConversation({ id: 'c2', other_user: bola })] })
    render(<MessagesListColumn />)
    expect(
      await screen.findByRole('list', { name: MESSAGES_LIST_COPY.earlier }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: MESSAGES_LIST_COPY.unread })).toBeNull()
  })

  it('marks the row whose thread is OPEN, and only that one', async () => {
    // The whole point of a list beside a detail: with nothing marked, the
    // reader cannot tell which of two threads the pane is showing.
    twoThreads()
    pathname = '/chat/u2'
    render(<MessagesListColumn />)
    const open = await screen.findByRole('link', { name: /Bola Ade/ })
    expect(open).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Ada Okafor/ })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing when the surface itself is open', async () => {
    twoThreads()
    render(<MessagesListColumn />)
    const rows = await screen.findAllByRole('link')
    expect(rows.filter((row) => row.getAttribute('aria-current') === 'true')).toHaveLength(0)
  })

  it('addresses a thread by the OTHER USER, which is what /chat takes', async () => {
    // Keyed on the conversation id instead, every row would 404: the route is
    // /chat/<userId> and the conversation is found by participant pair.
    twoThreads()
    render(<MessagesListColumn />)
    expect(await screen.findByRole('link', { name: /Bola Ade/ })).toHaveAttribute(
      'href',
      '/chat/u2',
    )
  })

  it('does NOT fetch: the layout owns the inbox, badge and all', () => {
    // `useInboxRealtime` is mounted once by the session layout and already
    // loads, reconnect-refreshes and polls this data. A fetch here would
    // duplicate every one of those requests.
    render(<MessagesListColumn />)
    expect(fetchConversations).not.toHaveBeenCalled()
  })

  it('shows the empty state once the load has actually finished', () => {
    render(<MessagesListColumn />)
    expect(screen.getByText(MESSAGES_LIST_COPY.surface.emptyTitle)).toBeInTheDocument()
  })

  it('says a failed index is a READ failure, and retries from there', async () => {
    useChatStore.setState({ conversationsStatus: 'error' })
    render(<MessagesListColumn />)
    expect(screen.getByText(MESSAGES_LIST_COPY.error)).toBeInTheDocument()
    // The sentence that stops a failed list reading as lost money.
    expect(screen.getByText(LIST_ERROR_COPY.body)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: LIST_ERROR_COPY.retry }))
    expect(fetchConversations).toHaveBeenCalledTimes(1)
  })

  it('leaves the skeleton for a load that has not settled', () => {
    // Never the empty state first: "no conversations yet" is a claim, and a
    // pending request has not earned it.
    useChatStore.setState({ conversationsStatus: 'loading' })
    render(<MessagesListColumn />)
    expect(screen.queryByText(MESSAGES_LIST_COPY.surface.emptyTitle)).toBeNull()
  })

  it('does not blank a populated list while it refreshes behind them', () => {
    // The remount case, which is EVERY thread open: the slot moves from
    // @list/messages to @list/chat and Next remounts the column. Measured as
    // ["rows:1", "SKELETON", "rows:1"] before the status moved to the store.
    twoThreads()
    useChatStore.setState({ conversationsStatus: 'loading' })
    render(<MessagesListColumn />)
    expect(screen.getByRole('link', { name: /Bola Ade/ })).toBeInTheDocument()
    expect(document.querySelector('.animate-shimmer')).toBeNull()
  })

  it('does not take a populated list away because a background poll failed', () => {
    twoThreads()
    useChatStore.setState({ conversationsStatus: 'error' })
    render(<MessagesListColumn />)
    expect(screen.getByRole('link', { name: /Bola Ade/ })).toBeInTheDocument()
    expect(screen.queryByText(MESSAGES_LIST_COPY.error)).toBeNull()
  })
})
