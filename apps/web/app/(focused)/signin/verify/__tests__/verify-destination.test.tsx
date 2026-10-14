/**
 * Where the OTP step LANDS the reader (#27) — the destination it was carrying,
 * a hostile one refused, and the hand-off to the profile waypoint.
 *
 * Its own file because verify-flow.test.tsx is about the submit/resend paths
 * and these three pushed it past the 300-line rule. The setup below is the
 * same shape as that file's on purpose: both render the same page and need a
 * pending challenge for it to render at all.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import SignInVerifyPage from '@/app/(focused)/signin/verify/page'
import { AUTH_COPY } from '@/components/auth/copy'
import { useAuthStore } from '@/stores/auth.store'
import { useSigninFlowStore } from '@/stores/signin-flow.store'

/**
 * The code reads the destination from the URL at navigation time (not
 * `useSearchParams` — see lib/auth/return-path), so a case drives it by
 * putting it in jsdom's real History.
 */
function visiting(search: string) {
  window.history.replaceState({}, '', `${window.location.pathname}${search}`)
}

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))
vi.mock('@/api/client', () => ({
  api: { auth: { challenge: vi.fn() } },
}))

describe('SignInVerifyPage — where it lands the reader (#27)', () => {
  beforeEach(() => {
    visiting('')
    // The clock is frozen to the pending challenge's own `sentAt`: with real
    // time that code is decades expired and the page refuses to submit it, so
    // every case here would assert against a navigation that never happened.
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    replace.mockClear()
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000, expiresIn: 600 },
    })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useSigninFlowStore.setState({ pending: null })
    useAuthStore.setState({ profileComplete: null })
  })

  const typeCode = async (code: string) => {
    const cells = screen.getAllByRole('textbox')
    await act(async () => {
      fireEvent.change(cells[0], { target: { value: code } })
    })
  }

  it('lands the reader on the destination they were heading for (#27)', async () => {
    visiting('?next=%2Fmy-gigs%2Fesc-1')
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockResolvedValue({ isNew: false }),
      profileComplete: true,
    })
    render(<SignInVerifyPage />)
    await typeCode('123456')
    expect(replace).toHaveBeenCalledWith('/my-gigs/esc-1')
  })

  it('refuses a hostile destination and lands on the default (#27)', async () => {
    // The open redirect, asserted where the navigation actually happens.
    visiting('?next=https%3A%2F%2Fevil.example')
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockResolvedValue({ isNew: false }),
      profileComplete: true,
    })
    render(<SignInVerifyPage />)
    await typeCode('123456')
    expect(replace).toHaveBeenCalledWith('/home')
  })

  it('hands the destination to the profile step rather than consuming it (#27)', async () => {
    visiting('?next=%2Fmy-gigs%2Fesc-1')
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockResolvedValue({ isNew: true }),
      profileComplete: false,
    })
    render(<SignInVerifyPage />)
    await typeCode('123456')
    expect(replace).toHaveBeenCalledWith('/onboarding/profile?next=%2Fmy-gigs%2Fesc-1')
  })

  it('keeps the destination when a RELOAD bounces it back to the email step', async () => {
    // The pending challenge is in-memory on purpose, so a reload lands here
    // with nothing and restarts the flow. That is the deep-link case exactly —
    // dropping the param here loses the destination for the reader most likely
    // to have arrived by a shared link.
    useSigninFlowStore.setState({ pending: null })
    visiting('?next=%2Fmy-gigs%2Fesc-1')

    render(<SignInVerifyPage />)

    expect(replace).toHaveBeenCalledWith('/signin/email?next=%2Fmy-gigs%2Fesc-1')
  })

  it('restarts at a bare email step when there is no destination', async () => {
    useSigninFlowStore.setState({ pending: null })
    visiting('')

    render(<SignInVerifyPage />)

    expect(replace).toHaveBeenCalledWith('/signin/email')
  })

  it('keeps the destination on the CHANGE EMAIL link (#27)', async () => {
    visiting('?next=%2Fmy-gigs%2Fesc-1')
    render(<SignInVerifyPage />)
    expect(screen.getByRole('link', { name: AUTH_COPY.verify.back })).toHaveAttribute(
      'href',
      '/signin/email?next=%2Fmy-gigs%2Fesc-1',
    )
  })
})
