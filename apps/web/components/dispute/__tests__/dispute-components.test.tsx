/**
 * Dispute presentation: the list row's identity/outcome lines, the
 * context header's party chips (self reads "You", raiser flagged,
 * expandable reason), and the bubble's resolved-sender rendering with
 * the mediator's distinct voice.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { DisputeThreadContext, MyDisputeRow as MyDisputeRowData } from '@tenda/shared'
import { DisputeContextHeader, DisputeMessageBubble } from '@/components/dispute'
import { DISPUTES_LIST_COPY } from '@/components/dispute/copy'

function rowOf(over: Partial<MyDisputeRowData> = {}): MyDisputeRowData {
  return {
    dispute_id: 'd1',
    escrow_id: 'e1',
    kind: 'gig',
    subject_title: 'Paint my fence',
    status: 'disputed',
    my_role: 'creator',
    counterparty_name: 'Bola Ade',
    reason: 'not done',
    raised_at: '2026-08-15T10:00:00.000Z',
    winner: null,
    resolved_at: null,
    raised_by_me: true,
    ...over,
  }
}

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
  reason: 'Work was not completed as described in the listing at all.',
  raised_at: null,
  winner: null,
  resolved_at: null,
}

test('the row line names the raiser side while open, and the OUTCOME once settled', () => {
  // The row itself is now the shared `EscrowRow` (the chassis every workspace
  // list uses); what stays dispute-specific is which fact earns the subtitle.
  // Once a dispute is settled, the outcome is the only reason to look at the
  // row at all — "you raised this" is history by then.
  expect(DISPUTES_LIST_COPY.subtitle(rowOf())).toBe('Bola Ade · You raised this')
  expect(DISPUTES_LIST_COPY.subtitle(rowOf({ raised_by_me: false }))).toBe(
    'Bola Ade · Raised against you',
  )
  expect(
    DISPUTES_LIST_COPY.subtitle(
      rowOf({ raised_by_me: false, resolved_at: '2026-08-16T00:00:00Z', winner: 'creator', status: 'resolved' }),
    ),
  ).toContain('Outcome:')
  // A party with no profile name is still referenceable.
  expect(DISPUTES_LIST_COPY.subtitle(rowOf({ counterparty_name: null }))).toContain(
    'the other party',
  )
})

test('context header: self reads You, the raiser carries the flag, the reason expands', async () => {
  render(<DisputeContextHeader context={CONTEXT} currentUserId="me" />)
  expect(screen.getByText('You')).toBeInTheDocument()
  expect(screen.getByText('Bola Ade')).toBeInTheDocument()
  expect(screen.getByLabelText('Raised the dispute')).toBeInTheDocument()

  const toggle = screen.getByRole('button', { name: 'Expand dispute reason' })
  await userEvent.click(toggle)
  expect(screen.getByRole('button', { name: 'Collapse dispute reason' })).toBeInTheDocument()
})

test('bubbles: my voice needs no label; a party shows its label; the mediator reads distinct', () => {
  const message = {
    id: 'm1',
    dispute_id: 'd1',
    sender_id: 'x',
    body: 'hello there',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-08-15T10:00:00.000Z',
  }
  const { rerender } = render(
    <DisputeMessageBubble message={message} sender={{ kind: 'me', label: 'You', role: 'creator' }} />,
  )
  expect(screen.queryByText('You')).toBeNull() // own bubbles carry no label

  rerender(
    <DisputeMessageBubble message={message} sender={{ kind: 'party', label: 'Bola (Worker)', role: 'counterparty' }} />,
  )
  expect(screen.getByText('Bola (Worker)')).toBeInTheDocument()

  rerender(
    <DisputeMessageBubble message={message} sender={{ kind: 'mediator', label: 'Mediator', role: null }} onAttachmentPress={vi.fn()} />,
  )
  expect(screen.getByText('Mediator')).toBeInTheDocument()
})

/** The one element carrying `cls`, or a failure naming what was missing. */
function ringedBy(container: HTMLElement, cls: string): HTMLElement {
  const matches = container.querySelectorAll<HTMLElement>(`.${cls}`)
  if (matches.length !== 1) {
    throw new Error(`expected exactly one element with .${cls}, found ${matches.length}`)
  }
  return matches[0]
}

test('the header tints each party with ITS accent — poster accent, worker brand', () => {
  // This is what the shared `partyAccent` move (#43) exists to hold. Without
  // it web had no assertion tying a role to a colour at all: the map could be
  // swapped and all 14 dispute tests stayed green, so web and mobile were free
  // to call the poster different colours.
  const { container } = render(<DisputeContextHeader context={CONTEXT} currentUserId="nobody" />)

  // The ringed avatar's parent is the chip, which also holds the party's name.
  expect(ringedBy(container, 'ring-feedback-warning-base').parentElement).toHaveTextContent('Ada Okafor')
  expect(ringedBy(container, 'ring-brand-primary').parentElement).toHaveTextContent('Bola Ade')
})

test('the bubble stripes each incoming party with the SAME accent as its chip', () => {
  const message = {
    id: 'm1',
    dispute_id: 'd1',
    sender_id: 'x',
    body: 'hello there',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at: '2026-08-15T10:00:00.000Z',
  }

  const { container, rerender } = render(
    <DisputeMessageBubble message={message} sender={{ kind: 'party', label: 'Ada', role: 'creator' }} />,
  )
  expect(container.querySelector('.border-l-feedback-warning-base')).not.toBeNull()
  expect(container.querySelector('.border-l-brand-primary')).toBeNull()

  rerender(
    <DisputeMessageBubble message={message} sender={{ kind: 'party', label: 'Bola', role: 'counterparty' }} />,
  )
  expect(container.querySelector('.border-l-brand-primary')).not.toBeNull()
  expect(container.querySelector('.border-l-feedback-warning-base')).toBeNull()

  // Negative: the mediator is nobody's party, so it gets neither accent —
  // a transparent stripe that keeps the text aligned with the party bubbles.
  rerender(
    <DisputeMessageBubble message={message} sender={{ kind: 'mediator', label: 'Mediator', role: null }} />,
  )
  expect(container.querySelector('.border-l-feedback-warning-base')).toBeNull()
  expect(container.querySelector('.border-l-brand-primary')).toBeNull()
  expect(container.querySelector('.border-l-transparent')).not.toBeNull()
})
