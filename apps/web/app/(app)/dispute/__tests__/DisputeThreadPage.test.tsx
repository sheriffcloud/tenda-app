/**
 * The mediation page's own logic (the chat-thread analogue): the shared
 * feed renders CHRONOLOGICALLY (the newest-first builder is reversed for
 * top→bottom scroll), and the composer obeys the voice matrix — parties
 * post, a resolved thread posts for no one, and a mediator READS without
 * the claim but only posts WITH it.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { DisputeMessage, DisputeThreadContext } from '@tenda/shared'

const threadState = vi.hoisted(() => ({
  current: {
    loading: false,
    error: null as string | null,
    thread: null as Record<string, unknown> | null,
    messages: [] as DisputeMessage[],
    send: vi.fn(),
    reload: vi.fn(),
  },
}))

vi.mock('next/navigation', () => ({ useParams: () => ({ escrowId: 'e1' }) }))
vi.mock('@/hooks/dispute/useDisputeThread', () => ({
  useDisputeThread: () => threadState.current,
}))
vi.mock('@/hooks/uploads/useAttachmentUpload', () => ({
  useAttachmentUpload: () => ({ uploading: false, upload: vi.fn() }),
}))

import DisputeThreadPage from '../[escrowId]/page'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../../../test/factories/user'

// jsdom implements scrollIntoView but not Element.scrollTo (the page's
// bottom-pin); a no-op keeps the pin effect from crashing the render.
Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {})

const CONTEXT: DisputeThreadContext = {
  kind: 'gig',
  status: 'disputed',
  chain_id: 'solana:devnet',
  asset: 'USDC_SOL',
  amount_raw: '50000000',
  subject_title: 'Paint my fence',
  parties: [
    { user_id: 'me', role: 'creator', first_name: 'Ada', last_name: 'Okafor', raised_dispute: true },
    { user_id: 'them', role: 'counterparty', first_name: 'Bola', last_name: 'Ade', raised_dispute: false },
  ],
  reason: 'Work not done',
  raised_at: null,
  winner: null,
  resolved_at: null,
}

function messageOf(id: string, senderId: string, body: string, minute: number): DisputeMessage {
  return {
    id,
    dispute_id: 'd1',
    sender_id: senderId,
    body,
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: `2026-08-15T12:${String(minute).padStart(2, '0')}:00.000Z`,
  }
}

function threadOf(over: Record<string, unknown> = {}) {
  return { escrow_id: 'e1', read_only: false, assigned_to_id: null, context: CONTEXT, reads: [], ...over }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser({ id: 'me' }), isAuthenticated: true })
  threadState.current.thread = threadOf()
  threadState.current.messages = []
})

test('messages render CHRONOLOGICALLY top→bottom (the builder is newest-first)', () => {
  threadState.current.messages = [
    messageOf('m1', 'me', 'first message', 0),
    messageOf('m2', 'them', 'second message', 5),
    messageOf('m3', 'me', 'third message', 9),
  ]
  render(<DisputeThreadPage />)
  const bodies = ['first message', 'second message', 'third message'].map(
    (t) => screen.getByText(t).compareDocumentPosition(screen.getByText('third message')),
  )
  // first and second PRECEDE third in the DOM; third compares to itself as 0.
  expect(bodies[0] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(bodies[1] & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(bodies[2]).toBe(0)
})

test('a party gets the composer; a resolved thread is read-only for everyone', () => {
  render(<DisputeThreadPage />)
  expect(screen.getByPlaceholderText('Message…')).toBeInTheDocument()

  threadState.current.thread = threadOf({ read_only: true })
  render(<DisputeThreadPage />)
  expect(screen.getAllByPlaceholderText('Message…')).toHaveLength(1) // only the first render's
  expect(screen.getByText('This dispute is resolved, the conversation is read-only.')).toBeInTheDocument()
})

test('a mediator READS without the claim (banner, no composer) and posts only WITH it', () => {
  useAuthStore.setState({ user: makeUser({ id: 'admin-1' }) }) // not in parties → mediator seat
  const { unmount } = render(<DisputeThreadPage />)
  expect(screen.queryByPlaceholderText('Message…')).toBeNull()
  expect(screen.getByText(/Claim this dispute in the admin dashboard/)).toBeInTheDocument()
  unmount()

  threadState.current.thread = threadOf({ assigned_to_id: 'admin-1' })
  render(<DisputeThreadPage />)
  expect(screen.getByPlaceholderText('Message…')).toBeInTheDocument()
})

test('parties see the unassigned notice until an admin claims the dispute', () => {
  render(<DisputeThreadPage />)
  expect(screen.getByText(/An admin will join this conversation shortly/)).toBeInTheDocument()
})
