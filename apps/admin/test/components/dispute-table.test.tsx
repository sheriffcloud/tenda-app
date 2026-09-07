import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { DisputeSummary } from '@tenda/shared'
import { DisputeTable } from '@/components/disputes/dispute-table'

vi.mock('@/api/client', () => ({ adminApi: { disputes: { claim: vi.fn(), release: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Complete, uncast: the badge reads the mediator name pair, and an `as` cast
// would let a missing field arrive as `undefined` with every assertion green.
function dispute(over: Partial<DisputeSummary> = {}): DisputeSummary {
  return {
    dispute_id: 'd1', escrow_id: 'e1', kind: 'gig', subject_title: 'Fix my sink',
    reason: 'work not done', raised_by_id: 'r1', raised_by_first_name: 'Ray', raised_by_last_name: 'X',
    raised_at: '2026-06-10T00:00:00.000Z', assigned_to_id: null, assigned_to_first_name: null,
    assigned_to_last_name: null, assigned_at: null, winner: null, resolved_by_id: null,
    resolved_by_first_name: null, resolved_by_last_name: null, resolved_at: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('empty list renders the empty-state copy', () => {
  render(<DisputeTable disputes={[]} meId="me" onChanged={() => {}} />)
  expect(screen.getByText('No disputes here.')).toBeInTheDocument()
})

test('renders a row with subject, kind, raiser and an unclaimed badge', () => {
  render(<DisputeTable disputes={[dispute()]} meId="me" onChanged={() => {}} />)
  expect(screen.getByRole('link', { name: 'Fix my sink' })).toHaveAttribute('href', '/disputes/d1')
  expect(screen.getByText('work not done')).toBeInTheDocument()
  expect(screen.getByText('Ray X')).toBeInTheDocument()
  expect(screen.getByText('unclaimed')).toBeInTheDocument()
})

test('status badge reflects claim ownership and resolution, and NAMES the holder', () => {
  const { rerender } = render(<DisputeTable disputes={[dispute({ assigned_to_id: 'me' })]} meId="me" onChanged={() => {}} />)
  expect(screen.getByText('mine')).toBeInTheDocument()
  // A colleague's claim is useless without a name — that was the whole gap.
  rerender(<DisputeTable disputes={[dispute({ assigned_to_id: 'other', assigned_to_first_name: 'Bola', assigned_to_last_name: 'Bello' })]} meId="me" onChanged={() => {}} />)
  expect(screen.getByText('claimed · Bola Bello')).toBeInTheDocument()
  // Resolved rows name the RESOLVER, and the name has to survive the trip
  // through the table — this row's id previously arrived unnamed and unread.
  rerender(<DisputeTable disputes={[dispute({ resolved_at: '2026-06-11T00:00:00.000Z', winner: 'creator', resolved_by_id: 'other', resolved_by_first_name: 'Rita', resolved_by_last_name: 'Resolver' })]} meId="me" onChanged={() => {}} />)
  expect(screen.getByText('resolved · Poster · Rita Resolver')).toBeInTheDocument()
})

test('two rows held by different mediators are told apart', () => {
  // A single-row assertion cannot catch a badge that renders one name for all.
  const rows = [
    dispute({ dispute_id: 'd1', assigned_to_id: 'a1', assigned_to_first_name: 'Ada', assigned_to_last_name: 'Admin' }),
    dispute({ dispute_id: 'd2', assigned_to_id: 'a2', assigned_to_first_name: 'Bola', assigned_to_last_name: 'Bello' }),
  ]
  render(<DisputeTable disputes={rows} meId="me" onChanged={() => {}} />)
  expect(screen.getByText('claimed · Ada Admin')).toBeInTheDocument()
  expect(screen.getByText('claimed · Bola Bello')).toBeInTheDocument()
})

test('a raiser with no profile name falls back to the shortened id, not a blank cell', () => {
  // The raiser column formats through the shared helper, same as the badge —
  // hand-formatting rendered a bare space for a nameless user.
  const nameless = dispute({
    raised_by_id: 'abcdef12-3456-7890',
    raised_by_first_name: null,
    raised_by_last_name: null,
  })
  render(<DisputeTable disputes={[nameless]} meId="me" onChanged={() => {}} />)
  expect(screen.getByText('User abcdef12')).toBeInTheDocument()
})

test('falls back to "Exchange offer" when there is no subject title', () => {
  render(<DisputeTable disputes={[dispute({ kind: 'exchange', subject_title: null })]} meId="me" onChanged={() => {}} />)
  expect(screen.getByRole('link', { name: 'Exchange offer' })).toBeInTheDocument()
})

test('renders an em dash for a null raised_at', () => {
  render(<DisputeTable disputes={[dispute({ raised_at: null })]} meId="me" onChanged={() => {}} />)
  const row = screen.getByRole('row', { name: /Fix my sink/ })
  expect(within(row).getByText('—')).toBeInTheDocument()
})
