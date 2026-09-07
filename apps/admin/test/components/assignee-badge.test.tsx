/**
 * AssigneeBadge — the single source for a dispute's status chip on both the
 * queue table and the detail header.
 *
 * The fixture is deliberately COMPLETE (no `as DisputeSummary` cast): the whole
 * point of this component is the mediator name pair, and a cast would let a
 * missing field read back as `undefined` while every assertion still passed.
 */
import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DisputeSummary } from '@tenda/shared'
import { AssigneeBadge } from '@/components/disputes/assignee-badge'

const ME = 'admin-me'
const OTHER = 'admin-other'

function dispute(over: Partial<DisputeSummary> = {}): DisputeSummary {
  return {
    dispute_id: 'd1',
    escrow_id: 'e1',
    kind: 'gig',
    subject_title: 'Fix my sink',
    reason: 'work not done',
    raised_by_id: 'r1',
    raised_by_first_name: 'Ray',
    raised_by_last_name: 'X',
    raised_at: '2026-06-10T00:00:00.000Z',
    assigned_to_id: null,
    assigned_to_first_name: null,
    assigned_to_last_name: null,
    assigned_at: null,
    winner: null,
    resolved_by_id: null,
    resolved_by_first_name: null,
    resolved_by_last_name: null,
    resolved_at: null,
    ...over,
  }
}

const claimedByOther = {
  assigned_to_id: OTHER,
  assigned_to_first_name: 'Bola',
  assigned_to_last_name: 'Bello',
  assigned_at: '2026-06-11T00:00:00.000Z',
}

const RESOLVER = 'admin-resolver'
const resolvedByRita = {
  resolved_at: '2026-06-12T00:00:00.000Z',
  resolved_by_id: RESOLVER,
  resolved_by_first_name: 'Rita',
  resolved_by_last_name: 'Resolver',
}

test('an unclaimed dispute reads as the open pool', () => {
  render(<AssigneeBadge dispute={dispute()} meId={ME} />)
  expect(screen.getByText('unclaimed')).toBeInTheDocument()
})

test('a colleague’s claim NAMES that colleague', () => {
  // The reported gap: the badge used to say only "claimed", so the queue could
  // not tell you which mediator to chase.
  render(<AssigneeBadge dispute={dispute(claimedByOther)} meId={ME} />)
  expect(screen.getByText('claimed · Bola Bello')).toBeInTheDocument()
})

test('my own claim stays first-person and never renders my name', () => {
  const mine = dispute({
    assigned_to_id: ME,
    assigned_to_first_name: 'Ada',
    assigned_to_last_name: 'Admin',
  })
  render(<AssigneeBadge dispute={mine} meId={ME} />)
  expect(screen.getByText('mine')).toBeInTheDocument()
  expect(screen.queryByText(/Ada Admin/)).not.toBeInTheDocument()
})

test('a nameless mediator falls back to the shortened id, never blank or "null"', () => {
  const anonymous = dispute({ assigned_to_id: 'abcdef12-3456-7890' })
  render(<AssigneeBadge dispute={anonymous} meId={ME} />)
  expect(screen.getByText('claimed · User abcdef12')).toBeInTheDocument()
  expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
})

test('a resolved dispute reports the outcome in KIND-AWARE words, not the raw enum', () => {
  const resolved = dispute({ resolved_at: '2026-06-12T00:00:00.000Z', winner: 'creator' })
  const { rerender } = render(<AssigneeBadge dispute={resolved} meId={ME} />)
  expect(screen.getByText('resolved · Poster')).toBeInTheDocument()
  expect(screen.queryByText(/creator/)).not.toBeInTheDocument()

  // Same structural winner, different escrow kind ⇒ different word.
  rerender(<AssigneeBadge dispute={{ ...resolved, kind: 'exchange' }} meId={ME} />)
  expect(screen.getByText('resolved · Maker')).toBeInTheDocument()
})

test('resolution wins over assignment: a resolved dispute never reads as claimed', () => {
  // Resolving does not clear assigned_to, so the ladder order matters.
  const resolved = dispute({
    ...claimedByOther,
    resolved_at: '2026-06-12T00:00:00.000Z',
    winner: 'split',
  })
  render(<AssigneeBadge dispute={resolved} meId={ME} />)
  expect(screen.getByText('resolved · Split evenly')).toBeInTheDocument()
  expect(screen.queryByText(/^claimed/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Bola Bello/)).not.toBeInTheDocument()
})

test('a resolved dispute with no recorded winner degrades to bare copy', () => {
  render(<AssigneeBadge dispute={dispute({ resolved_at: '2026-06-12T00:00:00.000Z' })} meId={ME} />)
  expect(screen.getByText('resolved')).toBeInTheDocument()
})

test('a resolved dispute NAMES the resolver alongside the outcome', () => {
  render(<AssigneeBadge dispute={dispute({ ...resolvedByRita, winner: 'creator' })} meId={ME} />)
  expect(screen.getByText('resolved · Poster · Rita Resolver')).toBeInTheDocument()
})

test('the resolver is named even when no winner was recorded', () => {
  // The two segments are independently nullable; a missing outcome must not
  // swallow the resolver, or the one case where you most want to ask someone
  // what happened is the case that hides who to ask.
  render(<AssigneeBadge dispute={dispute(resolvedByRita)} meId={ME} />)
  expect(screen.getByText('resolved · Rita Resolver')).toBeInTheDocument()
})

test('the RESOLVER is named, not the mediator who happened to hold the claim', () => {
  // Claiming and resolving are different acts by different people: a mediator
  // can hold a case that a super_admin's proposal ultimately settled. Sourcing
  // this from assigned_to would credit the wrong admin while still looking
  // populated.
  render(
    <AssigneeBadge dispute={dispute({ ...claimedByOther, ...resolvedByRita, winner: 'split' })} meId={ME} />,
  )
  expect(screen.getByText('resolved · Split evenly · Rita Resolver')).toBeInTheDocument()
  expect(screen.queryByText(/Bola Bello/)).not.toBeInTheDocument()
})

test('a resolution with NO recorded resolver invents nobody', () => {
  // displayName falls back to "User <id-prefix>", so gating on the name rather
  // than the id would fabricate a resolver for every CLI/direct-resolve
  // settlement — which is the majority of historic rows.
  render(<AssigneeBadge dispute={dispute({ resolved_at: '2026-06-12T00:00:00.000Z', winner: 'creator' })} meId={ME} />)
  expect(screen.getByText('resolved · Poster')).toBeInTheDocument()
  expect(screen.queryByText(/User /)).not.toBeInTheDocument()
  expect(screen.queryByText(/Unknown/)).not.toBeInTheDocument()
})

test('a nameless resolver falls back to the shortened id, never blank or "null"', () => {
  const anonymous = dispute({
    resolved_at: '2026-06-12T00:00:00.000Z',
    resolved_by_id: 'fedcba98-7654-3210',
    winner: 'creator',
  })
  render(<AssigneeBadge dispute={anonymous} meId={ME} />)
  expect(screen.getByText('resolved · Poster · User fedcba98')).toBeInTheDocument()
  expect(screen.queryByText(/null/)).not.toBeInTheDocument()
})
