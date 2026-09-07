/**
 * The OTP step's SUBMIT and RESEND paths: where the code goes, what a rejection
 * leaves behind, and the two guards on sending another one.
 *
 * The countdown half lives in verify-clocks.test.tsx.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import SignInVerifyPage from '@/app/(focused)/signin/verify/page'
import { AUTH_COPY } from '@/components/auth/copy'
import { api } from '@/api/client'
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

describe('SignInVerifyPage — verifying and resending', () => {
  beforeEach(() => {
    visiting('')
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

  it('sends a reader with a complete profile to the workspace', async () => {
    const signIn = vi.fn().mockResolvedValue({ isNew: false })
    useAuthStore.setState({ signInWithVerify: signIn, profileComplete: true })
    render(<SignInVerifyPage />)
    await typeCode('123456')
    expect(signIn).toHaveBeenCalledWith({
      method: 'email',
      identifier: 'ada@x.io',
      code: '123456',
    })
    expect(replace).toHaveBeenCalledWith('/home')
  })

  it('sends a reader with no name to the profile step, not the workspace', async () => {
    // The routing predicate is the SERVER's `profile_complete`, never a guess:
    // landing a nameless account on /home means every gig it posts is anonymous.
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockResolvedValue({ isNew: true }),
      profileComplete: false,
    })
    render(<SignInVerifyPage />)
    await typeCode('123456')
    expect(replace).toHaveBeenCalledWith('/onboarding/profile')
  })

  it('clears the field on a bad code so the next attempt starts clean', async () => {
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockRejectedValue(new Error('nope')),
      profileComplete: null,
    })
    render(<SignInVerifyPage />)
    await typeCode('000000')
    expect(screen.getByRole('alert')).toHaveTextContent(AUTH_COPY.verify.failed)
    expect(replace).not.toHaveBeenCalled()
    // Six empty cells again — a wrong code left in place invites the same
    // wrong code being submitted twice.
    for (const cell of screen.getAllByRole('textbox')) {
      expect(cell).toHaveValue('')
    }
  })

  it('a resend restarts the expiry with the window the server just gave', async () => {
    vi.mocked(api.auth.challenge).mockResolvedValue({ expires_in: 120 })
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: AUTH_COPY.verify.resend }))
    })
    expect(api.auth.challenge).toHaveBeenCalledWith({ method: 'email', identifier: 'ada@x.io' })
    // Both clocks moved: the new window, anchored now.
    expect(useSigninFlowStore.getState().pending).toMatchObject({
      sentAt: 1_000_000,
      expiresIn: 120,
    })
    expect(screen.getByText(AUTH_COPY.verify.expiresIn('2:00'))).toBeInTheDocument()
  })

  it('will not send a new code while a verify is in flight', async () => {
    // A new code invalidates the one being checked, so an unguarded resend
    // lets the reader's own click fail their own submission.
    let release: (v: unknown) => void = () => {}
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockReturnValue(new Promise((r) => { release = r })),
    })
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    // Cooldown is up, so the only thing that can disable it is the in-flight verify.
    expect(screen.getByRole('button', { name: AUTH_COPY.verify.resend })).toBeEnabled()
    await act(async () => {
      fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '123456' } })
    })
    expect(screen.getByRole('button', { name: AUTH_COPY.verify.resend })).toBeDisabled()
    await act(async () => {
      release({ isNew: false })
    })
  })

  it('holds the pending challenge until it UNMOUNTS, not the moment it succeeds', async () => {
    // Clearing in the success path empties this card before the next route
    // paints — a blank shell mid-transition, measured at ~35ms locally and
    // longer the slower the route. The identifier still must not outlive the
    // flow, so the clear moves to unmount.
    useAuthStore.setState({
      signInWithVerify: vi.fn().mockResolvedValue({ isNew: false }),
      profileComplete: true,
    })
    const { unmount } = render(<SignInVerifyPage />)
    await typeCode('123456')
    expect(replace).toHaveBeenCalledWith('/home')
    // Still there: the card is still on screen, so it still has a lede to show.
    expect(useSigninFlowStore.getState().pending).not.toBeNull()

    unmount()
    expect(useSigninFlowStore.getState().pending).toBeNull()
  })

  it('keeps the address when the reader LEAVES to change it', async () => {
    // The other half: unmounting without a successful verify — "Change email"
    // — must keep the pending challenge, or that step opens on an empty box.
    render(<SignInVerifyPage />).unmount()
    expect(useSigninFlowStore.getState().pending).not.toBeNull()
  })

  it('leaves the cursor on the resend button when the RESEND fails', async () => {
    // The focus restore is for a rejected CODE. A failed resend sets an error
    // too, and restoring on that yanks the cursor out of the button the reader
    // just pressed and into a field whose new code has not arrived — which for
    // a screen reader means the announcement lands somewhere they did not go.
    vi.mocked(api.auth.challenge).mockRejectedValue(new Error('down'))
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    const resend = screen.getByRole('button', { name: AUTH_COPY.verify.resend })
    resend.focus()
    await act(async () => {
      fireEvent.click(resend)
    })
    expect(screen.getByText(AUTH_COPY.verify.resendFailed)).toBeInTheDocument()
    expect(resend).toHaveFocus()
  })

  it('sends ONE code for two fast clicks on resend', async () => {
    // The cooldown only starts once the challenge RESOLVES, so it cannot guard
    // the request still in flight. Two codes means two emails or two SMS the
    // platform pays for — and the first to arrive is already dead, which reads
    // to the reader as "the code they sent me does not work".
    //
    // Both clicks land in ONE batch here, which is stricter than a browser:
    // Chromium flushes between two real clicks, so this pins the ref lock
    // specifically. The browser-level guarantee is asserted in e2e.
    let release: (v: unknown) => void = () => {}
    vi.mocked(api.auth.challenge).mockReturnValue(
      new Promise<{ expires_in?: number }>((r) => {
        release = r as (v: unknown) => void
      }),
    )
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    const resend = screen.getByRole('button', { name: AUTH_COPY.verify.resend })
    await act(async () => {
      fireEvent.click(resend)
      fireEvent.click(resend)
    })
    expect(api.auth.challenge).toHaveBeenCalledTimes(1)
    // …and the button says what it is doing rather than sitting unchanged.
    expect(screen.getByRole('button', { name: AUTH_COPY.verify.resending })).toBeDisabled()

    await act(async () => {
      release({ expires_in: 600 })
    })
    // The in-flight lock lifts; the cooldown it just started holds the button.
    expect(
      screen.getByRole('button', { name: AUTH_COPY.verify.resendIn(60) }),
    ).toBeDisabled()
  })

  it('drops the countdown when the resend answers with NO window', async () => {
    // `expires_in` is optional on the wire. Carrying the old code's window
    // over to the new code would count down a number that describes neither.
    vi.mocked(api.auth.challenge).mockResolvedValue({})
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    expect(screen.getByText(AUTH_COPY.verify.expiresIn('9:00'))).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: AUTH_COPY.verify.resend }))
    })
    expect(useSigninFlowStore.getState().pending?.expiresIn).toBeNull()
    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument()
  })

  it('unlocks the resend when the challenge FAILS, so a retry really sends', async () => {
    // Not just "the button looks enabled": the lock is a ref, so releasing the
    // state without releasing the ref leaves a live-looking button that
    // silently does nothing, and the only way to another code is a reload —
    // which loses the pending challenge entirely.
    vi.mocked(api.auth.challenge).mockRejectedValue(new Error('down'))
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    const click = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: AUTH_COPY.verify.resend }))
      })
    }
    await click()
    expect(screen.getByRole('button', { name: AUTH_COPY.verify.resend })).toBeEnabled()

    vi.mocked(api.auth.challenge).mockResolvedValue({ expires_in: 300 })
    await click()
    expect(api.auth.challenge).toHaveBeenCalledTimes(2)
    expect(useSigninFlowStore.getState().pending?.expiresIn).toBe(300)
  })

  it('says so when the resend itself fails', async () => {
    vi.mocked(api.auth.challenge).mockRejectedValue(new Error('down'))
    useSigninFlowStore.setState({
      pending: { channel: 'email', identifier: 'ada@x.io', sentAt: 1_000_000 - 60_000, expiresIn: 600 },
    })
    render(<SignInVerifyPage />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: AUTH_COPY.verify.resend }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent(AUTH_COPY.verify.resendFailed)
  })
})
