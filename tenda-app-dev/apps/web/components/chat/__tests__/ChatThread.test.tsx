/**
 * Thread screen wiring: bootstrap states (loading/error/retry), the feed
 * with day headers + dividers, sending through the store with the escrow
 * context, the close-conversation menu flow, and attachment click routing
 * (image → lightbox, PDF → new tab).
 */
import { act, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { PublicUser } from '@tenda/shared'

const routerPush = vi.hoisted(() => vi.fn())
const conversationState = vi.hoisted(() => ({
  current: {
    conversationId: 'c1' as string | null,
    otherUser: null as PublicUser | null,
    loading: false,
    initError: false,
    retry: () => {},
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, back: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/hooks/chat/useConversation', () => ({
  useConversation: () => conversationState.current,
}))
vi.mock('@/hooks/chat/useChatRealtime', () => ({ useChatRealtime: () => {} }))

// Captures the thread's REAL options so tests can drive the onUploaded
// closure and the uploading flag.
const uploadState = vi.hoisted(() => ({
  uploading: false,
  lastOptions: null as { onUploaded: (a: { url: string; type: 'image' | 'file'; size: number }) => void | Promise<void> } | null,
}))
vi.mock('@/hooks/uploads/useAttachmentUpload', () => ({
  useAttachmentUpload: (options: { onUploaded: (a: { url: string; type: 'image' | 'file'; size: number }) => void | Promise<void> }) => {
    uploadState.lastOptions = options
    return { uploading: uploadState.uploading, upload: vi.fn() }
  },
}))

import { ChatThread } from '@/components/chat/ChatThread'
import { useChatStore } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { makePublicUser, makeUser } from '../../../test/factories/user'
import { makeMessage } from '../../../test/factories/chat'

const sendMessage = vi.fn<() => Promise<void>>()
const closeConversation = vi.fn<() => Promise<void>>()


beforeEach(() => {
  vi.clearAllMocks()
  sendMessage.mockResolvedValue()
  closeConversation.mockResolvedValue()
  conversationState.current = {
    conversationId: 'c1',
    otherUser: makePublicUser(),
    loading: false,
    initError: false,
    retry: vi.fn(),
  }
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
  useChatStore.setState({
    sendMessage,
    closeConversation,
    messages: {
      c1: [
        makeMessage({ id: 'm1', content: 'first', escrow_id: 'e1', escrow_title: 'Paint', escrow_kind: 'gig' }),
        makeMessage({ id: 'm2', content: 'second', sender_id: 'me' }),
      ],
    },
  })
})

test('renders the feed with day header, context divider and both bubbles', () => {
  render(<ChatThread userId="them" />)
  expect(screen.getByText('Ada Okafor')).toBeInTheDocument()
  expect(screen.getByText('first')).toBeInTheDocument()
  expect(screen.getByText('second')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open gig: Paint' })).toBeInTheDocument()
  expect(screen.getByText('DIRECT MESSAGE')).toBeInTheDocument() // m2 dropped back to DM
})

test('sending routes through the store with the escrow context from the URL', async () => {
  render(
    <ChatThread
      userId="them"
      context={{ escrowId: 'e9', escrowTitle: 'Fix sink', kind: 'gig' }}
    />,
  )
  await userEvent.type(screen.getByPlaceholderText('Message…'), 'hello')
  await userEvent.keyboard('{Enter}')
  expect(sendMessage).toHaveBeenCalledWith('c1', 'hello', { escrowId: 'e9', kind: 'gig' })
})

test('the header menu closes on Escape and on clicking elsewhere', async () => {
  render(<ChatThread userId="them" />)
  const trigger = screen.getByRole('button', { name: 'More options' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /Close conversation/ })).toBeInTheDocument()

  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: /Close conversation/ })).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: 'More options' }))
  await userEvent.click(screen.getByText('first')) // anywhere outside the menu
  expect(screen.queryByRole('button', { name: /Close conversation/ })).toBeNull()
})

test('close conversation: menu → confirm → store call → back to the inbox', async () => {
  render(<ChatThread userId="them" />)
  await userEvent.click(screen.getByRole('button', { name: 'More options' }))
  await userEvent.click(screen.getByRole('button', { name: /Close conversation/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(closeConversation).toHaveBeenCalledWith('c1')
  await vi.waitFor(() => expect(routerPush).toHaveBeenCalledWith('/messages'))
})

test('image attachments open the lightbox; PDFs open a new tab', async () => {
  useChatStore.setState({
    messages: {
      c1: [
        makeMessage({ id: 'a1', content: '', attachment_url: 'https://cdn/x.png', attachment_type: 'image', attachment_size: 1 }),
        makeMessage({ id: 'a2', content: '', attachment_url: 'https://cdn/d.pdf', attachment_type: 'file', attachment_size: 1 }),
      ],
    },
  })
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
  render(<ChatThread userId="them" />)

  await userEvent.click(screen.getByRole('button', { name: 'View image attachment' }))
  expect(screen.getByRole('button', { name: 'Close viewer' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Open document attachment' }))
  expect(openSpy).toHaveBeenCalledWith('https://cdn/d.pdf', '_blank', 'noopener')
  openSpy.mockRestore()
})

test('incoming messages pin to the bottom only while the reader is near it', () => {
  const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
  const { rerender } = render(<ChatThread userId="them" />)
  expect(scrollSpy).toHaveBeenCalledTimes(1) // initial load lands on newest

  // Reader scrolls deep into history (far from the bottom):
  const list = screen.getByTestId('chat-message-list')
  Object.defineProperties(list, {
    scrollHeight: { configurable: true, value: 2000 },
    clientHeight: { configurable: true, value: 400 },
    scrollTop: { configurable: true, value: 100, writable: true },
  })
  fireEvent.scroll(list)
  // Inside `act`: a store write while the thread is MOUNTED re-renders it, and
  // the pin-to-bottom effect is precisely what this test is measuring — so it
  // has to be flushed, not left to land after the assertion.
  act(() => {
    useChatStore.setState((s) => ({
      messages: { c1: [...(s.messages.c1 ?? []), makeMessage({ id: 'new-1', content: 'while reading' })] },
    }))
  })
  rerender(<ChatThread userId="them" />)
  expect(scrollSpy).toHaveBeenCalledTimes(1) // NOT yanked

  // Back near the bottom: the next message pins again.
  list.scrollTop = 1590
  fireEvent.scroll(list)
  act(() => {
    useChatStore.setState((s) => ({
      messages: { c1: [...(s.messages.c1 ?? []), makeMessage({ id: 'new-2', content: 'at bottom' })] },
    }))
  })
  rerender(<ChatThread userId="them" />)
  expect(scrollSpy).toHaveBeenCalledTimes(2)
  scrollSpy.mockRestore()
})

test('a failed bubble retries through the store with the message intact', async () => {
  const retryMessage = vi.fn()
  useChatStore.setState({
    retryMessage,
    messages: { c1: [{ ...makeMessage({ id: 'f1', content: 'lost', sender_id: 'me' }), _status: 'failed' as const }] },
  })
  render(<ChatThread userId="them" />)
  await userEvent.click(screen.getByRole('button', { name: /Didn't send/ }))
  expect(retryMessage).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'f1' }))
})

test('an uploaded attachment sends an attachment-only message into the context', async () => {
  render(
    <ChatThread userId="them" context={{ escrowId: 'e9', escrowTitle: null, kind: 'gig' }} />,
  )
  await uploadState.lastOptions?.onUploaded({ url: 'https://cdn/a.png', type: 'image', size: 7 })
  expect(sendMessage).toHaveBeenCalledWith(
    'c1',
    '',
    { escrowId: 'e9', kind: 'gig' },
    { url: 'https://cdn/a.png', type: 'image', size: 7 },
  )
})

test('while uploading, the hint shows and the composer is disabled', () => {
  uploadState.uploading = true
  render(<ChatThread userId="them" />)
  expect(screen.getByText('Uploading attachment…')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  uploadState.uploading = false
})

test('an empty thread shows the say-hi empty state', () => {
  useChatStore.setState({ messages: { c1: [] } })
  render(<ChatThread userId="them" />)
  expect(screen.getByText('No messages yet. Say hi!')).toBeInTheDocument()
})

test('cancelling the close dialog keeps the thread; a failing close stays put', async () => {
  render(<ChatThread userId="them" />)
  await userEvent.click(screen.getByRole('button', { name: 'More options' }))
  await userEvent.click(screen.getByRole('button', { name: /Close conversation/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(closeConversation).not.toHaveBeenCalled()

  closeConversation.mockRejectedValueOnce(new Error('down'))
  await userEvent.click(screen.getByRole('button', { name: 'More options' }))
  await userEvent.click(screen.getByRole('button', { name: /Close conversation/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  await vi.waitFor(() => expect(closeConversation).toHaveBeenCalled())
  expect(routerPush).not.toHaveBeenCalled() // failure never navigates away
})

test('bootstrap error shows the retry surface and loading shows neither', () => {
  conversationState.current = { ...conversationState.current, initError: true, conversationId: null }
  const { unmount } = render(<ChatThread userId="them" />)
  expect(screen.getByText("Couldn't open chat")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(conversationState.current.retry).toHaveBeenCalled()
  unmount()

  conversationState.current = { ...conversationState.current, initError: false, loading: true }
  render(<ChatThread userId="them" />)
  expect(screen.queryByText("Couldn't open chat")).toBeNull()
  expect(screen.queryByPlaceholderText('Message…')).toBeNull()
})
