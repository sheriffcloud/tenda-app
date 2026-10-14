/**
 * The OTP step's CLOCKS.
 *
 * Both countdowns run off ONE ticking `now`, and both are derived rather than
 * decremented — a `setInterval` that subtracts one per tick drifts under a
 * backgrounded tab and reads wrong the moment the tab comes back, which on a
 * ten-minute code is the difference between "still valid" and "expired".
 *
 * The submit/resend half lives in verify-flow.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import SignInVerifyPage, {
  formatClock,
  secondsLeft,
} from '@/app/(focused)/signin/verify/page'
import { AUTH_COPY } from '@/components/auth/copy'
import { useAuthStore } from '@/stores/auth.store'
import { useSigninFlowStore } from '@/stores/signin-flow.store'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/api/client', () => ({
  api: { auth: { challenge: vi.fn() } },
}))

describe('secondsLeft', () => {
  it('counts down whole seconds from the window start', () => {
    expect(secondsLeft(1_000_000, 600, 1_000_000)).toBe(600)
    expect(secondsLeft(1_000_000, 600, 1_030_000)).toBe(570)
  })

  it('floors at zero rather than going negative', () => {
    // A tab left open past the window would otherwise render "-412".
    expect(secondsLeft(1_000_000, 600, 9_999_999)).toBe(0)
  })

  it('is derived from the clock, so a backgrounded tab catches up', () => {
    // Same start, a jump of ten minutes: the answer is the truth, not the
    // number of ticks that happened to fire.
    expect(secondsLeft(0, 600, 600_000)).toBe(0)
  })
})

describe('formatClock', () => {
  it('reads as m:ss so a remainder is not a raw second count', () => {
    expect(formatClock(600)).toBe('10:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(0)).toBe('0:00')
  })
})

describe('SignInVerifyPage — the expiry the server set', () => {
  beforeEach(() => {
    // No auto-advance: the page's 1s interval would then fire outside act()
    // and fill the run with warnings. Every assertion here is about a
    // DERIVED clock, so the tests set the system time and never need it to
    // move — which is the same property that makes the page survive a
    // backgrounded tab.
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => {
    // Unmount BEFORE restoring real timers. RTL's auto-cleanup runs after this
    // hook, so the page's 1s interval would otherwise be handed back a real
    // clock while still mounted and fire into the next test — which is where
    // the act() warnings were coming from.
    cleanup()
    vi.useRealTimers()
    useSigninFlowStore.setState({ pending: null })
  })

  const pend = (expiresIn: number | null) =>
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000, expiresIn },
    })

  it('counts the server’s window down, and echoes where the code went', () => {
    pend(600)
    render(<SignInVerifyPage />)
    expect(screen.getByText(AUTH_COPY.verify.expiresIn('10:00'))).toBeInTheDocument()
    expect(screen.getByText(/ada@x\.io/)).toBeInTheDocument()
  })

  it('says NOTHING about expiry when the server did not give a window', () => {
    // `expires_in` is optional on the wire; a countdown invented from a
    // guessed TTL would be a claim this app cannot back.
    pend(null)
    render(<SignInVerifyPage />)
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument()
    expect(screen.queryByText(AUTH_COPY.verify.expired)).not.toBeInTheDocument()
  })

  it('calls an expired code expired, and stops offering to verify it', async () => {
    // A code the server has already dropped cannot be typed correctly, so
    // letting someone try is a worse answer than telling them.
    const signIn = vi.fn()
    useAuthStore.setState({ signInWithVerify: signIn })
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 0, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    expect(screen.getByRole('alert')).toHaveTextContent(AUTH_COPY.verify.expired)
    // ONCE. The countdown slot used to fall back to the same sentence, so the
    // card said "This code has expired" twice, 40px apart — which reads as a
    // rendering fault rather than emphasis. Nor does the slot stay behind
    // counting "Expires in 0:00" next to the line saying it already did.
    expect(screen.getAllByText(AUTH_COPY.verify.expired)).toHaveLength(1)
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument()

    // A FULL code, so the assertion isolates `expired` — with an empty field
    // the button is disabled for length alone and this passes either way.
    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '123456' } })
    })
    expect(screen.getByRole('button', { name: AUTH_COPY.verify.cta })).toBeDisabled()
    // …and the auto-submit at six digits does not fire behind the disabled CTA.
    expect(signIn).not.toHaveBeenCalled()
  })

  it('offers a new code once the resend cooldown is up, not before', () => {
    pend(600)
    const { unmount } = render(<SignInVerifyPage />)
    expect(
      screen.getByRole('button', { name: AUTH_COPY.verify.resendIn(60) }),
    ).toBeDisabled()
    unmount()

    // Sixty seconds later the same derived clock says it is available.
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    expect(screen.getByRole('button', { name: AUTH_COPY.verify.resend })).toBeEnabled()
  })

  it('renders nothing at all with no pending challenge — it bounces instead', () => {
    // Reload or deep link: the identifier is deliberately not in the URL, so
    // there is nothing to show and the effect sends the reader back.
    const { container } = render(<SignInVerifyPage />)
    expect(container).toBeEmptyDOMElement()
  })
})
