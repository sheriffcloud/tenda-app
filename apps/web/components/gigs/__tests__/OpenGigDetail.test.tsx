/**
 * The browse pane's wrapper states, and — through its real consumer — the
 * GigListingView session branch (#49 audit): a resolved gig renders the shared
 * listing body with the ACTION island for a session, and with NO island — and
 * no anonymous sign-in CTA either — while the session id is still null. The
 * `null`-not-`undefined` rule in GigListingView is what that last case guards:
 * `undefined` would make the aside fall back to the public sign-in island.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { GigDetail } from '@tenda/shared'

const { authState, gigsState, configState } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: true,
    user: null as { id: string } | null,
    isLoading: false,
    loadSession: vi.fn(async () => {}),
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
    fetch: vi.fn(async () => {}),
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
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

import { OpenGigDetail } from '../OpenGigDetail'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { STRANGER_ID, gigDetail } from '@/components/gig/detail/__tests__/fixtures'

const BRIEF = 'Sand it, prime it, two coats of white.'

beforeEach(() => {
  authState.user = { id: STRANGER_ID }
  gigsState.selectedGig = null
  gigsState.error = null
  gigsState.fetchGigDetail.mockClear()
})

test('a failed read shows the unavailable panel, and retry actually refetches', () => {
  gigsState.error = { id: 'escrow-1' }
  render(<OpenGigDetail escrowId="escrow-1" />)
  expect(screen.getByText(GIG_DETAIL_COPY.unavailableTitle)).toBeInTheDocument()
  const before = gigsState.fetchGigDetail.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: GIG_DETAIL_COPY.unavailableAction }))
  expect(gigsState.fetchGigDetail.mock.calls.length).toBe(before + 1)
})

test('no answer yet — for this id — means the spinner, not a stale gig', () => {
  // The stale-slot case IS the loading case here: another gig in the store
  // must never render under this URL.
  gigsState.selectedGig = gigDetail({ escrow_id: 'some-other-gig', description: BRIEF })
  render(<OpenGigDetail escrowId="escrow-1" />)
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  expect(screen.queryByText(BRIEF)).not.toBeInTheDocument()
})

test('a resolved gig renders the listing body with the session action island', () => {
  gigsState.selectedGig = gigDetail({ description: BRIEF })
  render(<OpenGigDetail escrowId="escrow-1" />)
  expect(screen.getByText(BRIEF)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Accept Gig' })).toBeInTheDocument()
})

test('while the session id is still null the aside holds NO island — not the sign-in CTA', () => {
  authState.user = null
  gigsState.selectedGig = gigDetail({ description: BRIEF })
  render(<OpenGigDetail escrowId="escrow-1" />)
  expect(screen.getByText(BRIEF)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Accept Gig' })).not.toBeInTheDocument()
  // `undefined` instead of GigListingView's explicit `null` would render the
  // anonymous island here and flash "Sign in" at a signed-in user.
  expect(screen.queryByRole('link', { name: /Sign in/ })).not.toBeInTheDocument()
})
