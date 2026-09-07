import { test, expect, vi, beforeEach } from 'vitest'
import { type ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DisputeMessage, DisputeThreadResponse, DossierParty } from '@tenda/shared'
import { ThreadView } from '@/components/disputes/thread-view'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'
import { toast } from 'sonner'
import { setSession } from '@/lib/auth'

vi.mock('@/api/client', () => ({
  adminApi: { disputeThread: { get: vi.fn(), send: vi.fn() } },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const get = vi.mocked(adminApi.disputeThread.get)
const send = vi.mocked(adminApi.disputeThread.send)
const err = vi.mocked(toast.error)

function thread(over: Partial<DisputeThreadResponse> = {}): DisputeThreadResponse {
  return { dispute_id: 'd1', escrow_id: 'e1', assigned_to_id: 'me', read_only: false, context: null, messages: [], reads: [], ...over }
}
function msg(over: Partial<DisputeMessage> = {}): DisputeMessage {
  return {
    id: 'm1',
    dispute_id: 'd1',
    sender_id: 'me',
    body: 'hi',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-06-10T00:00:00.000Z',
    ...over,
  }
}

const PARTIES: DossierParty[] = [
  { role: 'creator', user_id: 'poster', first_name: 'Ada', last_name: 'Lovelace', raised_dispute: false },
  { role: 'counterparty', user_id: 'worker', first_name: 'Tunde', last_name: 'Bello', raised_dispute: true },
]

// Default props keep every case focused on the behaviour under test.
function renderThread(props: Partial<ComponentProps<typeof ThreadView>> = {}) {
  return render(
    <ThreadView escrowId="e1" onAssignee={vi.fn()} kind="gig" parties={PARTIES} {...props} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setSession('jwt', { id: 'me', role: 'dispute_admin', first_name: 'D', last_name: 'A' })
})

test('first poll loads and renders thread messages', async () => {
  get.mockResolvedValue(thread({ messages: [msg({ id: 'm1', body: 'hello there', sender_id: 'other' })] }))
  renderThread()
  expect(await screen.findByText('hello there')).toBeInTheDocument()
})

test('image evidence renders a thumbnail the mediator can open', async () => {
  get.mockResolvedValue(
    thread({
      messages: [
        msg({
          id: 'm1',
          body: '',
          sender_id: 'other',
          attachment_url: 'https://res.cloudinary.com/x/e.jpg',
          attachment_type: 'image',
          attachment_size: 2048,
        }),
      ],
    }),
  )
  renderThread()
  const img = await screen.findByRole('img', { name: 'Image evidence' })
  expect(img).toHaveAttribute('src', 'https://res.cloudinary.com/x/e.jpg')
})

test('document evidence renders an openable link alongside the body', async () => {
  get.mockResolvedValue(
    thread({
      messages: [
        msg({
          id: 'm1',
          body: 'see attached',
          sender_id: 'other',
          attachment_url: 'https://res.cloudinary.com/x/e.pdf',
          attachment_type: 'file',
          attachment_size: 4096,
        }),
      ],
    }),
  )
  renderThread()
  const link = await screen.findByTitle('Document evidence')
  expect(link).toHaveAttribute('href', 'https://res.cloudinary.com/x/e.pdf')
  expect(screen.getByText('see attached')).toBeInTheDocument()
})

test('labels each sender: own → You, admins → Mediator, parties → role · name', async () => {
  get.mockResolvedValue(
    thread({
      assigned_to_id: 'med',
      messages: [
        msg({ id: 'a', sender_id: 'me', body: 'from me' }),
        msg({ id: 'b', sender_id: 'med', body: 'from the claim holder' }),
        msg({ id: 'c', sender_id: 'poster', body: 'from poster' }),
        msg({ id: 'd', sender_id: 'worker', body: 'from worker' }),
        // An admin who mediated earlier and has since handed the claim on.
        msg({ id: 'e', sender_id: 'previous-mediator', body: 'from the previous mediator' }),
      ],
    }),
  )
  renderThread()
  expect(await screen.findByText('from worker')).toBeInTheDocument()
  expect(screen.getByText('You')).toBeInTheDocument()
  expect(screen.getByText('Poster · Ada Lovelace')).toBeInTheDocument()
  expect(screen.getByText('Worker · Tunde Bello')).toBeInTheDocument()
  // Both admin voices read as the mediator: identity is party MEMBERSHIP, so
  // a handoff no longer demotes the earlier mediator to a bare "Participant".
  expect(screen.getAllByText('Mediator')).toHaveLength(2)
  expect(screen.queryByText('Participant')).not.toBeInTheDocument()
})

test('a party who holds the claim is labelled as a party, never as the mediator', async () => {
  // An admin who is also a disputant used to be dressed up as the neutral
  // arbiter to the person they were disputing with.
  get.mockResolvedValue(
    thread({
      assigned_to_id: 'poster',
      messages: [msg({ id: 'a', sender_id: 'poster', body: 'from the poster-admin' })],
    }),
  )
  renderThread()
  expect(await screen.findByText('from the poster-admin')).toBeInTheDocument()
  expect(screen.getByText('Poster · Ada Lovelace')).toBeInTheDocument()
  expect(screen.queryByText('Mediator')).not.toBeInTheDocument()
})

test('while the dossier is still loading, senders stay neutral', async () => {
  // The page passes `dossier?.parties ?? []` — with no party list nothing can
  // be placed, and guessing "Mediator" would be worse than saying so.
  get.mockResolvedValue(
    thread({
      assigned_to_id: 'med',
      messages: [msg({ id: 'a', sender_id: 'poster', body: 'from poster' })],
    }),
  )
  renderThread({ parties: [] })
  expect(await screen.findByText('from poster')).toBeInTheDocument()
  expect(screen.getByText('Participant')).toBeInTheDocument()
  expect(screen.queryByText('Poster · Ada Lovelace')).not.toBeInTheDocument()
})

test('empty thread shows the no-messages placeholder', async () => {
  get.mockResolvedValue(thread({ messages: [] }))
  renderThread()
  expect(await screen.findByText('No messages yet.')).toBeInTheDocument()
})

test('read-only thread renders the frozen banner and no composer', async () => {
  get.mockResolvedValue(thread({ read_only: true }))
  renderThread()
  expect(await screen.findByText(/this thread is frozen/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
})

test('claim held by another mediator disables the composer', async () => {
  get.mockResolvedValue(thread({ assigned_to_id: 'someone-else' }))
  renderThread()
  const send = await screen.findByRole('button', { name: 'Send' })
  expect(send).toBeDisabled()
  expect(screen.getByPlaceholderText('Claim the dispute to post')).toBeDisabled()
})

test('the claimer can post, which calls send and appends the message', async () => {
  get.mockResolvedValue(thread())
  send.mockResolvedValueOnce(msg({ id: 'new', body: 'my reply' }))
  renderThread()
  const box = await screen.findByPlaceholderText('Write to both parties…')
  await userEvent.type(box, 'my reply')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(send).toHaveBeenCalledWith('e1', 'my reply'))
  expect(await screen.findByText('my reply')).toBeInTheDocument()
})

test('a send that 403s prompts the claim-first toast', async () => {
  get.mockResolvedValue(thread())
  send.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'))
  renderThread()
  const box = await screen.findByPlaceholderText('Write to both parties…')
  await userEvent.type(box, 'hi')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('Claim the dispute before posting'))
})

test('a send rejected as DISPUTE_RESOLVED freezes the thread', async () => {
  get.mockResolvedValue(thread())
  send.mockRejectedValueOnce(new ApiError(409, 'DISPUTE_RESOLVED', 'x'))
  renderThread()
  const box = await screen.findByPlaceholderText('Write to both parties…')
  await userEvent.type(box, 'hi')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(err).toHaveBeenCalledWith('Dispute resolved — the thread is read-only'))
  expect(await screen.findByText(/this thread is frozen/)).toBeInTheDocument()
})

test('own messages align right, everyone else left', async () => {
  // Alignment and label are two readings of the same question; they are
  // derived from one resolution so they can never disagree.
  get.mockResolvedValue(
    thread({
      assigned_to_id: 'med',
      messages: [
        msg({ id: 'a', sender_id: 'me', body: 'mine' }),
        msg({ id: 'b', sender_id: 'poster', body: 'theirs' }),
      ],
    }),
  )
  const { container } = renderThread()
  expect(await screen.findByText('theirs')).toBeInTheDocument()

  const rowOf = (body: string): Element => {
    const row = screen.getByText(body).closest('.flex-col')
    if (row === null) throw new Error(`no row for ${body}`)
    return row
  }
  expect(rowOf('mine').className).toContain('items-end')
  expect(rowOf('theirs').className).toContain('items-start')
  expect(container.querySelectorAll('.items-end')).toHaveLength(1)
})
