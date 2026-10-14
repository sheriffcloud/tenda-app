/**
 * The focused shell's building blocks: the panel every auth step sits in, the
 * method cards on the chooser, and the name preview on the last step.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Mail } from 'lucide-react'
import { formatFullName } from '@tenda/shared'
import { AuthMethodCard } from '@/components/auth/AuthMethodCard'
import { AuthPanel } from '@/components/auth/AuthPanel'
import { NamePreview } from '@/components/auth/NamePreview'
import { AUTH_COPY } from '@/components/auth/copy'

describe('AuthPanel', () => {
  it('publishes exactly one h1, and the lede is not one', () => {
    render(
      <AuthPanel title="Enter the code" lede="Sent to ada@x.io.">
        <p>body</p>
      </AuthPanel>,
    )
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeInTheDocument()
    expect(screen.getByText('Sent to ada@x.io.')).toBeInTheDocument()
  })

  it('offers the way back only when the step has one', () => {
    const { unmount } = render(
      <AuthPanel title="t">
        <p>body</p>
      </AuthPanel>,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    unmount()

    render(
      <AuthPanel title="t" back={{ href: '/signin', label: 'All sign-in methods' }}>
        <p>body</p>
      </AuthPanel>,
    )
    expect(screen.getByRole('link', { name: 'All sign-in methods' })).toHaveAttribute(
      'href',
      '/signin',
    )
  })

  it('renders the eyebrow as a label, never as a second heading', () => {
    // "Last step" is a kicker; publishing it into the outline would give the
    // page two headings where it has one thing to say.
    render(
      <AuthPanel title="t" eyebrow="Last step">
        <p>body</p>
      </AuthPanel>,
    )
    expect(screen.getByText('Last step').tagName).toBe('P')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('widens for the steps that need it, and only those', () => {
    // Six OTP cells do not fit the 420px the single-field steps use.
    const narrow = render(
      <AuthPanel title="t">
        <p>b</p>
      </AuthPanel>,
    )
    expect(narrow.container.firstElementChild?.className).toContain('max-w-[420px]')
    narrow.unmount()

    const code = render(
      <AuthPanel title="t" width="code">
        <p>b</p>
      </AuthPanel>,
    )
    expect(code.container.firstElementChild?.className).toContain('max-w-[460px]')
  })

  it('lets a long identifier break rather than overflow — in BOTH slots', () => {
    // The verify step echoes the address the reader typed, and it lands in the
    // LEDE ("Sent to …"), not the heading — which is where this was missing:
    // 595px of layout on a 320px screen, measured. Class presence only; the
    // load-bearing assertion is e2e ("a long address does not drag the card
    // off a 320px screen"), because `break-words` can be inert on its own.
    const address = 'averyveryverylongaddress@subdomain.example.com'
    render(
      <AuthPanel title={address} lede={`Sent to ${address}.`}>
        <p>b</p>
      </AuthPanel>,
    )
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('break-words')
    expect(screen.getByText(`Sent to ${address}.`).className).toContain('break-words')
  })
})

describe('AuthMethodCard', () => {
  it('says what CHOOSING it does, not just what it is called', () => {
    // Email creates accounts; a wallet only signs an existing one in. A chooser
    // that hides that sends a new user down the path that cannot finish.
    render(
      <AuthMethodCard
        href="/signin/email"
        icon={Mail}
        label={AUTH_COPY.chooser.email.label}
        hint={AUTH_COPY.chooser.email.hint}
      />,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/signin/email')
    expect(link).toHaveTextContent(AUTH_COPY.chooser.email.hint)
  })

  it('names the two methods differently enough to choose between', () => {
    expect(AUTH_COPY.chooser.email.hint).not.toBe(AUTH_COPY.chooser.wallet.hint)
    expect(AUTH_COPY.chooser.email.hint).toMatch(/creates an account/i)
    expect(AUTH_COPY.chooser.wallet.hint).toMatch(/already linked/i)
  })
})

describe('NamePreview', () => {
  it('shows the name as the gig card will, through the SHARED formatter', () => {
    render(<NamePreview firstName="Segun" lastName="Oyelaran" />)
    expect(screen.getByText(formatFullName('Segun', 'Oyelaran'))).toBeInTheDocument()
    expect(screen.getByText(AUTH_COPY.profile.previewCaption)).toBeInTheDocument()
  })

  it('holds the place before anything is typed, without inventing a name', () => {
    render(<NamePreview firstName="" lastName="" />)
    expect(screen.getByText(AUTH_COPY.profile.previewEmpty)).toBeInTheDocument()
  })

  it('treats a whitespace-only name as empty, like the rest of the app', () => {
    // `formatFullName` exists because `filter(Boolean)` keeps '  ' and the
    // fallback never fires — the preview must not reintroduce that.
    render(<NamePreview firstName="   " lastName="  " />)
    expect(screen.getByText(AUTH_COPY.profile.previewEmpty)).toBeInTheDocument()
  })

  it('previews a half-typed name rather than waiting for both fields', () => {
    render(<NamePreview firstName="Segun" lastName="" />)
    expect(screen.getByText('Segun')).toBeInTheDocument()
  })
})
