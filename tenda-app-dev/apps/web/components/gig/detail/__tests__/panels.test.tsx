/**
 * The detail surface's smaller parts: TakedownNotice audiences (shared copy
 * rendered to the right reader), PartyPanel's party-only visibility,
 * ApplicantList states + assign gating, and the FilePicker's MIME-derived
 * proof types.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { PROOF_TYPE_LABEL, STATUS_LABEL, takedownCopy } from '@tenda/shared'
import { DISPUTE_NOTICE_COPY } from '@/components/escrow/DisputeNotice'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { TakedownNotice } from '@/components/gig/detail/TakedownNotice'
import { PartyPanel } from '@/components/gig/detail/PartyPanel'
import { ApplicantList } from '@/components/gig/gig-applications'
import { FilePicker, proofTypeForFile } from '@/components/form/FilePicker'
import { escrowChatHref } from '@/lib/chat-href'
import {
  CREATOR_ID,
  STRANGER_ID,
  WORKER_ID,
  applicant,
  disputeRow,
  gigDetail,
  userRef,
} from './fixtures'

test('TakedownNotice renders nothing for a visible escrow', () => {
  const { container } = render(
    <TakedownNotice escrow={gigDetail()} subject="gig" viewerId={CREATOR_ID} />,
  )
  expect(container).toBeEmptyDOMElement()
})

test('TakedownNotice speaks to each audience with the shared copy', () => {
  const hidden = gigDetail({ hidden: true, counterparty: userRef(WORKER_ID) })
  render(<TakedownNotice escrow={hidden} subject="gig" viewerId={CREATOR_ID} />)
  expect(screen.getByText(takedownCopy('owner', 'gig').title)).toBeInTheDocument()
  cleanup()
  render(<TakedownNotice escrow={hidden} subject="gig" viewerId={WORKER_ID} />)
  expect(screen.getByText(takedownCopy('counterparty', 'gig').title)).toBeInTheDocument()
  cleanup()
  render(<TakedownNotice escrow={hidden} subject="gig" viewerId={'moderator-1'} />)
  expect(screen.getByText(takedownCopy('moderator', 'gig').title)).toBeInTheDocument()
})

test('PartyPanel: the viewer-relative escrow wallet renders only when the wire carries one', () => {
  // The wire is already owner-scoped (my_signer_address), so the panel's only
  // job is honesty: show what arrived, show nothing when nothing did.
  render(
    <PartyPanel
      gig={gigDetail({ my_signer_address: 'CreatorWa11et1111111111111111111111111111' })}
      userId={CREATOR_ID}
    />,
  )
  expect(screen.getByText('Your escrow wallet')).toBeInTheDocument()
  expect(screen.getByText('Crea…1111')).toBeInTheDocument()
  cleanup()

  // Null (outsider view / draft / pre-column escrow): no row, no placeholder.
  render(<PartyPanel gig={gigDetail({ my_signer_address: null })} userId={CREATOR_ID} />)
  expect(screen.queryByText('Your escrow wallet')).toBeNull()
})

test('PartyPanel renders only for parties, with proofs and the dispute reason', () => {
  const gig = gigDetail({
    status: 'disputed',
    counterparty: userRef(WORKER_ID),
    completion_deadline: '2026-09-01T00:00:00.000Z',
    approval_deadline: '2026-09-03T00:00:00.000Z',
    proofs: [
      {
        id: 'p1',
        escrow_id: 'escrow-1',
        url: 'https://cdn/proof.jpg',
        payload: null,
        type: 'image',
        uploaded_at: new Date('2026-08-10T00:00:00.000Z'),
      },
    ],
    dispute: disputeRow(),
  })
  const { container } = render(<PartyPanel gig={gig} userId={STRANGER_ID} />)
  expect(container).toBeEmptyDOMElement()
  cleanup()

  render(<PartyPanel gig={gig} userId={CREATOR_ID} />)
  // The DOSSIER's label (#48) — the raw "image proof" enum text is gone, so
  // one escrow's evidence reads the same here as in the workspace.
  expect(screen.getByRole('link', { name: PROOF_TYPE_LABEL.image })).toHaveAttribute(
    'href',
    'https://cdn/proof.jpg',
  )
  expect(screen.getByText('Package never arrived')).toBeInTheDocument()
  // Both deadline rows come off the wire — a panel that shows delivery and
  // silently drops approval hides the softer of the two clocks.
  expect(screen.getByText('Delivery deadline')).toBeInTheDocument()
  expect(screen.getByText('Approval deadline')).toBeInTheDocument()
})

test('a RESOLVED escrow shows no dispute notice — the dispute is over (mobile rule)', () => {
  // The wire keeps serving the dispute row after resolution; mobile gates the
  // block on status === 'disputed' (GigDetailBody), so web must too — a
  // "Dispute raised" banner with a mediation door on a settled escrow
  // misstates the state on the one surface that would differ.
  render(
    <PartyPanel
      gig={gigDetail({
        status: 'resolved',
        counterparty: userRef(WORKER_ID),
        dispute: disputeRow({
          winner: 'creator',
          resolved_by: 'admin-1',
          resolved_at: new Date('2026-08-12T00:00:00.000Z'),
        }),
      })}
      userId={CREATOR_ID}
    />,
  )
  expect(screen.queryByText(DISPUTE_NOTICE_COPY.title)).toBeNull()
  expect(screen.queryByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toBeNull()
})

test('PartyPanel draws the OTHER party as a PersonCard with the contextual message link', () => {
  const gig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  // The creator sees the worker…
  render(<PartyPanel gig={gig} userId={CREATOR_ID} />)
  expect(screen.getByText(GIG_DETAIL_COPY.worker)).toBeInTheDocument()
  // …and the message link carries THIS escrow's chat context, built by the
  // one shared href builder — never a hand-rolled query string.
  expect(screen.getByRole('link', { name: /^Message / })).toHaveAttribute(
    'href',
    escrowChatHref(WORKER_ID, { id: gig.escrow_id, title: gig.title, kind: 'gig' }),
  )
  cleanup()
  // The worker sees the poster, addressed the other way round.
  render(<PartyPanel gig={gig} userId={WORKER_ID} />)
  expect(screen.getByText(GIG_DETAIL_COPY.postedBy)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /^Message / })).toHaveAttribute(
    'href',
    escrowChatHref(CREATOR_ID, { id: gig.escrow_id, title: gig.title, kind: 'gig' }),
  )
})

test('PartyPanel names the status with the shared label, never the raw enum', () => {
  render(<PartyPanel gig={gigDetail({ status: 'disputed' })} userId={CREATOR_ID} />)
  // The SHARED vocabulary, imported — the panel used to print the raw wire
  // value, and TextMatch is case-sensitive, so the lowercase enum is provably
  // absent while the label is present.
  expect(screen.getByText(STATUS_LABEL.disputed)).toBeInTheDocument()
  expect(screen.queryByText('disputed')).toBeNull()
})

test('ApplicantList: rows offer Assign only while the gig AND the application allow it', () => {
  const rows = [
    applicant(),
    applicant({ id: 'app-2', status: 'passed', first_name: 'Lin', last_name: 'Wu' }),
  ]
  const onAssign = vi.fn()
  render(
    <ApplicantList
      applicants={rows}
      error={null}
      filter="all"
      onFilterChange={vi.fn()}
      assignable
      busy={false}
      onAssign={onAssign}
      onRetry={vi.fn()}
    />,
  )
  // One assignable row (open + unexpired), one settled row without a button.
  const buttons = screen.getAllByRole('button', { name: 'Assign this worker' })
  expect(buttons).toHaveLength(1)
  fireEvent.click(buttons[0])
  expect(onAssign).toHaveBeenCalledWith(rows[0])
  expect(screen.getByText('Not selected')).toBeInTheDocument()
})

test('ApplicantList: a non-assignable gig offers no buttons; empty + error states show', () => {
  render(
    <ApplicantList
      applicants={[applicant()]}
      error={null}
      filter="open"
      onFilterChange={vi.fn()}
      assignable={false}
      busy={false}
      onAssign={vi.fn()}
      onRetry={vi.fn()}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Assign this worker' })).not.toBeInTheDocument()
  cleanup()

  render(
    <ApplicantList
      applicants={[]}
      error={null}
      filter="open"
      onFilterChange={vi.fn()}
      assignable
      busy={false}
      onAssign={vi.fn()}
      onRetry={vi.fn()}
    />,
  )
  expect(screen.getByText('Nobody waiting on you')).toBeInTheDocument()
  cleanup()

  const onRetry = vi.fn()
  render(
    <ApplicantList
      applicants={[]}
      error="Could not load applicants."
      filter="open"
      onFilterChange={vi.fn()}
      assignable
      busy={false}
      onAssign={vi.fn()}
      onRetry={onRetry}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalled()
})

test('proofTypeForFile derives the proof type from the MIME', () => {
  expect(proofTypeForFile(new File([], 'a.jpg', { type: 'image/png' }))).toBe('image')
  expect(proofTypeForFile(new File([], 'a.mp4', { type: 'video/mp4' }))).toBe('video')
  expect(proofTypeForFile(new File([], 'a.pdf', { type: 'application/pdf' }))).toBe('document')
})

test('FilePicker adds typed files, removes them, and caps the batch', () => {
  const onChange = vi.fn()
  render(<FilePicker files={[]} onChange={onChange} max={2} />)
  const input = screen.getByLabelText('Choose proof files')
  fireEvent.change(input, {
    target: {
      files: [
        new File([], 'a.jpg', { type: 'image/jpeg' }),
        new File([], 'b.mp4', { type: 'video/mp4' }),
        new File([], 'c.pdf', { type: 'application/pdf' }),
      ],
    },
  })
  const picked = onChange.mock.calls[0][0] as { type: string }[]
  expect(picked).toHaveLength(2) // capped
  expect(picked.map((p) => p.type)).toEqual(['image', 'video'])
})

test('FilePicker remove buttons drop exactly one file', () => {
  const files = [
    { file: new File([], 'a.jpg', { type: 'image/jpeg' }), type: 'image' as const },
    { file: new File([], 'b.pdf', { type: 'application/pdf' }), type: 'document' as const },
  ]
  const onChange = vi.fn()
  render(<FilePicker files={files} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
  expect(onChange).toHaveBeenCalledWith([files[1]])
})
