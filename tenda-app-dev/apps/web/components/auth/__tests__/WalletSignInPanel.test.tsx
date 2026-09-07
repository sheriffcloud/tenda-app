/**
 * Wallet sign-in panel states: idle/connect, decline → quiet idle,
 * WALLET_NOT_LINKED as a FIRST-CLASS panel (email CTA + fresh retry),
 * classified errors, and the not-configured build.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiClientError } from '@tenda/shared'

const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const mockSignInWithWallet = vi.fn()
const mockGetState = vi.fn(() => ({ profileComplete: true }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: Object.assign(
    (sel: (s: { signInWithWallet: typeof mockSignInWithWallet }) => unknown) =>
      sel({ signInWithWallet: mockSignInWithWallet }),
    { getState: () => mockGetState() },
  ),
}))

const mockIsAvailable = vi.fn(async () => true)
const mockDisconnect = vi.fn(async () => {})
vi.mock('@/wallet/adapters/reown', () => ({
  reownAdapter: {
    isAvailable: () => mockIsAvailable(),
    disconnect: () => mockDisconnect(),
  },
}))

import { AUTH_COPY } from '@/components/auth/copy'
import { WalletSignInPanel } from '@/components/auth/WalletSignInPanel'

/**
 * The code reads the destination from the URL at navigation time (not
 * `useSearchParams` — see lib/auth/return-path), so a case drives it by
 * putting it in jsdom's real History.
 */
function visiting(search: string) {
  window.history.replaceState({}, '', `${window.location.pathname}${search}`)
}

async function clickConnect() {
  const button = await screen.findByRole('button', { name: AUTH_COPY.wallet.connect })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
}

// The URL is per-case state now, and this file had no reset — one test's
// `?next=` was leaking into every case after it.
beforeEach(() => {
  visiting('')
})

describe('idle + success', () => {
  it('signs in and routes home when the profile is complete', async () => {
    mockSignInWithWallet.mockResolvedValue(true)
    mockGetState.mockReturnValue({ profileComplete: true })
    render(<WalletSignInPanel />)
    await clickConnect()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'))
  })

  it('routes to onboarding when the profile is incomplete', async () => {
    mockSignInWithWallet.mockResolvedValue(true)
    mockGetState.mockReturnValue({ profileComplete: false })
    render(<WalletSignInPanel />)
    await clickConnect()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/onboarding/profile'))
  })

  it('lands on the destination the flow was carrying (#27)', async () => {
    // The wallet way in must land exactly where the OTP one does — both call
    // the same signedInDestination.
    visiting('?next=%2Fmy-gigs%2Fesc-1')
    mockSignInWithWallet.mockResolvedValue(true)
    mockGetState.mockReturnValue({ profileComplete: true })
    render(<WalletSignInPanel />)
    await clickConnect()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/my-gigs/esc-1'))
    visiting('')
  })

  it('refuses a hostile destination here too (#27)', async () => {
    visiting('?next=%2F%2Fevil.example')
    mockSignInWithWallet.mockResolvedValue(true)
    mockGetState.mockReturnValue({ profileComplete: true })
    render(<WalletSignInPanel />)
    await clickConnect()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'))
    visiting('')
  })

  it('keeps the destination on BACK and on the switch to email (#27)', async () => {
    // Correcting a wrong turn must not cost the deep link: a reader who backs
    // out to the chooser, or switches to email, is still heading somewhere.
    visiting('?next=%2Fmy-gigs%2Fesc-1')
    mockSignInWithWallet.mockResolvedValue(false)
    render(<WalletSignInPanel />)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: AUTH_COPY.wallet.back })).toHaveAttribute(
        'href',
        '/signin?next=%2Fmy-gigs%2Fesc-1',
      ),
    )
    // The other half this name promises — the LATERAL move to email, which is
    // the likelier one here (a reader whose wallet is not linked).
    expect(screen.getByRole('link', { name: AUTH_COPY.wallet.email })).toHaveAttribute(
      'href',
      '/signin/email?next=%2Fmy-gigs%2Fesc-1',
    )
  })

  it('a decline quietly returns to idle — no error banner, no navigation', async () => {
    mockSignInWithWallet.mockResolvedValue(false)
    render(<WalletSignInPanel />)
    await clickConnect()
    expect(await screen.findByRole('button', { name: AUTH_COPY.wallet.connect })).toBeEnabled()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.queryByText(/went wrong|cancelled/i)).toBeNull()
  })
})

describe('WALLET_NOT_LINKED — first-class state', () => {
  it('renders the explainer with the email CTA and a fresh retry', async () => {
    mockSignInWithWallet.mockRejectedValue(
      new ApiClientError(404, 'Not Found', 'wallet not linked', 'WALLET_NOT_LINKED'),
    )
    render(<WalletSignInPanel />)
    await clickConnect()

    expect(await screen.findByText(AUTH_COPY.wallet.notLinkedTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: AUTH_COPY.wallet.email })).toHaveAttribute('href', '/signin/email')

    // "Try another wallet" drops the session BEFORE reconnecting, so the
    // modal re-opens instead of fast-pathing back to the wallet that 404'd.
    mockSignInWithWallet.mockResolvedValue(true)
    await userEvent.click(screen.getByRole('button', { name: AUTH_COPY.wallet.tryAnother }))
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })
})

describe('errors + availability', () => {
  it('renders the classified copy for other failures, with retry', async () => {
    mockSignInWithWallet.mockRejectedValue(new ApiClientError(401, 'Unauthorized', 'bad sig'))
    render(<WalletSignInPanel />)
    await clickConnect()
    expect(await screen.findByText('Sign-in failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: AUTH_COPY.wallet.retry })).toBeInTheDocument()
  })

  it('an unconfigured build hides the connect button and points at email', async () => {
    mockIsAvailable.mockResolvedValue(false)
    render(<WalletSignInPanel />)
    expect(await screen.findByText(/not configured for this build/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: AUTH_COPY.wallet.connect })).toBeNull()
    expect(screen.getByRole('link', { name: AUTH_COPY.wallet.email })).toBeInTheDocument()
  })
})
