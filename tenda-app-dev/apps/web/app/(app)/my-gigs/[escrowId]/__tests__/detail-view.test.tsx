/**
 * The my-gigs detail pane picks its COMPOSITION by relationship (#49): a party
 * gets the dossier, anyone else gets the shared listing body — the brief and
 * the accept CTA a subscriber's notification or an Applied-tab row came for.
 * The dossier carries no brief, so each case asserts both what renders and
 * what must NOT.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { GigDetail } from '@tenda/shared'

const { authState, gigsState, configState } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: true,
    user: null as { id: string } | null,
    // The action island's SigningWalletRow reads these via useSigningWallet.
    wallets: [],
    ensureWallets: vi.fn(async () => {}),
  },
  gigsState: {
    selectedGig: null as GigDetail | null,
    error: null as { id: string } | null,
    fetchGigDetail: vi.fn(async () => {}),
    reviewEscrow: vi.fn(),
  },
  configState: {
    config: { grace_period_seconds: 3600, fee_bps: 250, seeker_fee_bps: 100 },
    // useEscrowFee selects `s.fetch` and calls it on mount.
    fetch: vi.fn(async () => {}),
  },
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ escrowId: 'escrow-1' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: <T,>(selector: (state: typeof authState) => T): T => selector(authState),
}))
vi.mock('@/stores/gigs.store', () => ({
  useGigsStore: <T,>(selector: (state: typeof gigsState) => T): T => selector(gigsState),
}))
vi.mock('@/stores/platform-config.store', () => ({
  usePlatformConfigStore: Object.assign(
    <T,>(selector: (state: typeof configState) => T): T => selector(configState),
    { getState: () => ({ ...configState, fetch: vi.fn() }) },
  ),
}))
vi.mock('@/hooks/escrow/live', () => ({ useEscrowLiveRefresh: vi.fn() }))

import MyGigDetailPage from '../page'
import { DISPUTE_NOTICE_COPY } from '@/components/escrow/DisputeNotice'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { MY_GIGS_COPY } from '@/components/gig/my-gigs/copy'
import { escrowChatHref } from '@/lib/chat-href'
import {
  CREATOR_ID,
  STRANGER_ID,
  WORKER_ID,
  disputeRow,
  gigDetail,
  userRef,
} from '@/components/gig/detail/__tests__/fixtures'

const BRIEF = 'Sand it, prime it, two coats of white.'

beforeEach(() => {
  authState.isAuthenticated = true
  authState.user = { id: CREATOR_ID }
  gigsState.selectedGig = null
  gigsState.error = null
  gigsState.fetchGigDetail.mockClear()
})

function openGig(): GigDetail {
  return gigDetail({ description: BRIEF })
}

test('the creator gets the dossier, which deliberately carries no brief', () => {
  gigsState.selectedGig = openGig()
  render(<MyGigDetailPage />)
  expect(screen.getByText('Escrow workspace')).toBeInTheDocument()
  expect(screen.queryByText(BRIEF)).not.toBeInTheDocument()
})

test('the assigned counterparty is a party too — dossier, not listing', () => {
  authState.user = { id: WORKER_ID }
  gigsState.selectedGig = gigDetail({
    description: BRIEF,
    status: 'accepted',
    counterparty: userRef(WORKER_ID),
    assigned_counterparty_id: WORKER_ID,
  })
  render(<MyGigDetailPage />)
  expect(screen.getByText('Escrow workspace')).toBeInTheDocument()
  expect(screen.queryByText(BRIEF)).not.toBeInTheDocument()
})

test('a non-party gets the listing body: the brief, and a live accept CTA', () => {
  authState.user = { id: STRANGER_ID }
  gigsState.selectedGig = openGig()
  render(<MyGigDetailPage />)
  expect(screen.getByText(BRIEF)).toBeInTheDocument()
  expect(screen.queryByText('Escrow workspace')).not.toBeInTheDocument()
  // Not just readable — actionable: the shared CTA branches still offer the
  // way in from this URL, which is what a new-gig notification needs.
  expect(screen.getByRole('button', { name: 'Accept Gig' })).toBeInTheDocument()
})

test('a failed read is a state: the unavailable panel with a way back', () => {
  gigsState.error = { id: 'escrow-1' }
  render(<MyGigDetailPage />)
  expect(screen.getByText(GIG_DETAIL_COPY.unavailableTitle)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: MY_GIGS_COPY.backToList })).toBeInTheDocument()
})

test('signed out, the pane renders nothing — AuthGate owns the redirect', () => {
  authState.isAuthenticated = false
  gigsState.selectedGig = openGig()
  const { container } = render(<MyGigDetailPage />)
  expect(container).toBeEmptyDOMElement()
})

test('while the session id is still null the dossier offers NO actions', () => {
  // Authenticated but the user record has not landed: the party content may
  // render, the transition machine may not — an action needs an identity.
  authState.user = null
  gigsState.selectedGig = openGig()
  render(<MyGigDetailPage />)
  expect(screen.getByText('Escrow workspace')).toBeInTheDocument()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

test("a disputed escrow's dossier carries the reason and the door into mediation", () => {
  // Mobile bakes this into the detail (DisputeReasonBlock); until #51 this
  // pane — where every dispute notification lands a party — had neither.
  gigsState.selectedGig = gigDetail({
    description: BRIEF,
    status: 'disputed',
    counterparty: userRef(WORKER_ID),
    dispute: disputeRow(),
  })
  render(<MyGigDetailPage />)
  expect(screen.getByText('Package never arrived')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toHaveAttribute(
    'href',
    '/dispute/escrow-1',
  )
})

test('an undisputed dossier offers no mediation door', () => {
  gigsState.selectedGig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  render(<MyGigDetailPage />)
  expect(screen.queryByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toBeNull()
})

test('a RESOLVED dossier drops the dispute banner even though the row still arrives', () => {
  // The wire keeps serving the dispute row to parties after resolution; the
  // status half of the gate is what keeps a settled escrow from shouting
  // "Dispute raised" (mobile's rule, and PartyPanel's).
  gigsState.selectedGig = gigDetail({
    status: 'resolved',
    counterparty: userRef(WORKER_ID),
    dispute: disputeRow({
      winner: 'creator',
      resolved_by: 'admin-1',
      resolved_at: new Date('2026-08-12T00:00:00.000Z'),
    }),
  })
  render(<MyGigDetailPage />)
  expect(screen.queryByText(DISPUTE_NOTICE_COPY.title)).toBeNull()
  expect(screen.queryByRole('link', { name: DISPUTE_NOTICE_COPY.openThread })).toBeNull()
})

test('the dossier draws the OTHER party with the contextual message link', () => {
  const gig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  gigsState.selectedGig = gig
  render(<MyGigDetailPage />) // the creator is signed in (beforeEach)
  expect(screen.getByText(GIG_DETAIL_COPY.worker)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /^Message / })).toHaveAttribute(
    'href',
    escrowChatHref(WORKER_ID, { id: gig.escrow_id, title: gig.title, kind: 'gig' }),
  )
})

test('the worker sees the poster, addressed the other way round', () => {
  authState.user = { id: WORKER_ID }
  const gig = gigDetail({ status: 'accepted', counterparty: userRef(WORKER_ID) })
  gigsState.selectedGig = gig
  render(<MyGigDetailPage />)
  expect(screen.getByText(GIG_DETAIL_COPY.postedBy)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /^Message / })).toHaveAttribute(
    'href',
    escrowChatHref(CREATOR_ID, { id: gig.escrow_id, title: gig.title, kind: 'gig' }),
  )
})

test('a stale slot for ANOTHER escrow renders neither composition', () => {
  gigsState.selectedGig = gigDetail({ escrow_id: 'some-other-gig', description: BRIEF })
  render(<MyGigDetailPage />)
  expect(screen.queryByText('Escrow workspace')).not.toBeInTheDocument()
  expect(screen.queryByText(BRIEF)).not.toBeInTheDocument()
})
