/**
 * The shared PersonCard names an AGENT (#19) with the shared label beside the
 * name — where a party decides who they are dealing with — and says nothing
 * of the kind for a person. Mirrors mobile's PersonCard.agent test.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AGENT_BADGE_LABEL } from '@tenda/shared'
import { PersonCard } from '@/components/shared/PersonCard'

vi.mock('@/components/profile', () => ({ StandingBadge: () => null }))

const user = { id: 'u-1', first_name: 'Dispatch', last_name: '', avatar_url: null, review_score: null }

describe('PersonCard', () => {
  it('badges an agent with the shared label, beside the name', () => {
    render(<PersonCard label="Posted by" user={{ ...user, is_agent: true }} currentUserId="me" />)
    // Inside the NAME link (the avatar link is the other one), after the name.
    const badge = screen.getByText(new RegExp(AGENT_BADGE_LABEL))
    expect(badge.closest('a')).toHaveTextContent(/^Dispatch/)
  })

  it('shows nothing of the kind for a person', () => {
    render(<PersonCard label="Posted by" user={user} currentUserId="me" />)
    expect(screen.queryByText(new RegExp(AGENT_BADGE_LABEL))).not.toBeInTheDocument()
  })
})
