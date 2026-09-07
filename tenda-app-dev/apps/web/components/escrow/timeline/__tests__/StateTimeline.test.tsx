import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ESCROW_BRANCH_STATUSES, STATUS_LABEL, formatRelativeDayWithTime } from '@tenda/shared'

import { STATE_TIMELINE_COPY, StateTimeline } from '@/components/escrow/timeline'

const steps = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('StateTimeline — the spine', () => {
  it('is an ordered list, because the steps have an order', () => {
    render(<StateTimeline escrow={{ status: 'open' }} />)
    expect(screen.getByRole('list').tagName).toBe('OL')
    expect(steps()).toHaveLength(4)
  })

  it('names every step from the shared labels rather than its own copy', () => {
    render(<StateTimeline escrow={{ status: 'open' }} />)
    for (const status of ['open', 'accepted', 'submitted', 'completed'] as const) {
      expect(screen.getByText(STATUS_LABEL[status])).toBeInTheDocument()
    }
  })

  it('states each step in TEXT, so the dot colour is not the only signal', () => {
    render(<StateTimeline escrow={{ status: 'accepted' }} />)
    const [open, accepted, submitted] = steps()
    expect(open).toHaveTextContent(STATE_TIMELINE_COPY.state.done)
    expect(accepted).toHaveTextContent(STATE_TIMELINE_COPY.state.current)
    expect(submitted).toHaveTextContent(STATE_TIMELINE_COPY.state.upcoming)
  })

  it('explains what each step means', () => {
    render(<StateTimeline escrow={{ status: 'open' }} />)
    expect(screen.getByText(STATE_TIMELINE_COPY.body.open)).toBeInTheDocument()
  })
})

describe('StateTimeline — stamps', () => {
  it('shows a stamp only where the wire carries one, and never the RAW iso', () => {
    // The default used to be the raw value, so every caller had to remember to
    // pass a formatter — and the first one that forgot printed
    // "2026-01-01T00:00:00Z" at a reader (the workspace dossier, #17 review).
    render(
      <StateTimeline
        escrow={{
          status: 'submitted',
          created_at: '2026-01-01T00:00:00Z',
          submitted_at: '2026-01-02T00:00:00Z',
        }}
      />,
    )
    expect(screen.queryByText('2026-01-01T00:00:00Z')).toBeNull()
    expect(screen.getByText(formatRelativeDayWithTime('2026-01-01T00:00:00Z'))).toBeInTheDocument()
    expect(screen.getByText(formatRelativeDayWithTime('2026-01-02T00:00:00Z'))).toBeInTheDocument()
  })

  it('renders no stamps at all when the wire carries none', () => {
    render(<StateTimeline escrow={{ status: 'submitted' }} />)
    expect(screen.queryByText(/2026-/)).not.toBeInTheDocument()
  })

  it('formats stamps through the caller, so display rules stay in one place', () => {
    render(
      <StateTimeline
        escrow={{ status: 'open', created_at: '2026-01-01T00:00:00Z' }}
        formatStamp={(iso) => `on ${iso.slice(0, 10)}`}
      />,
    )
    expect(screen.getByText('on 2026-01-01')).toBeInTheDocument()
  })
})

describe('StateTimeline — the terminal branch', () => {
  it('renders no branch while the escrow is on the happy path', () => {
    render(<StateTimeline escrow={{ status: 'accepted' }} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it.each(ESCROW_BRANCH_STATUSES)('renders a branch note for %s', (status) => {
    render(<StateTimeline escrow={{ status }} />)
    const note = screen.getByRole('note')
    expect(within(note).getByText(STATUS_LABEL[status])).toBeInTheDocument()
    // Every branch explains itself — no empty box.
    expect(note.textContent?.length ?? 0).toBeGreaterThan(STATUS_LABEL[status].length + 10)
  })

  it('marks no spine step as in-progress once the escrow has branched', () => {
    render(<StateTimeline escrow={{ status: 'disputed' }} />)
    for (const step of steps()) {
      expect(step).not.toHaveTextContent(STATE_TIMELINE_COPY.state.current)
    }
  })

  it('does not put a dispute after completion — it branches instead', () => {
    // Rendering the canonical status order would imply exactly that.
    render(<StateTimeline escrow={{ status: 'disputed' }} />)
    const labels = steps().map((s) => s.textContent ?? '')
    expect(labels.some((t) => t.includes(STATUS_LABEL.disputed))).toBe(false)
    expect(screen.getByRole('note')).toHaveTextContent(STATUS_LABEL.disputed)
  })

  it('claims only the progress the wire evidences on a branch', () => {
    render(<StateTimeline escrow={{ status: 'cancelled' }} />)
    const [open, accepted] = steps()
    expect(open).toHaveTextContent(STATE_TIMELINE_COPY.state.done)
    // A cancellation can happen from anywhere; do not invent acceptance.
    expect(accepted).toHaveTextContent(STATE_TIMELINE_COPY.state.upcoming)
  })
})

describe('StateTimeline — drafts', () => {
  it('shows a draft as having walked none of the spine', () => {
    render(<StateTimeline escrow={{ status: 'draft' }} />)
    for (const step of steps()) {
      expect(step).toHaveTextContent(STATE_TIMELINE_COPY.state.upcoming)
    }
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
