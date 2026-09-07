import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, buttonVariants, FormError, TextField } from '@/components/ui'
import { cn } from '@/lib/cn'

describe('Button', () => {
  it('defaults to type=button so it can never submit a form by accident', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button')
  })

  it('honours an explicit submit type and disabled state', async () => {
    const onClick = vi.fn()
    render(
      <Button type="submit" disabled onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toBeDisabled()
    await userEvent.click(button).catch(() => {})
    expect(onClick).not.toHaveBeenCalled()
  })

  it('buttonVariants produces distinct classes per variant for link styling', () => {
    expect(buttonVariants({ variant: 'primary' })).not.toBe(buttonVariants({ variant: 'outline' }))
    expect(buttonVariants({ variant: 'ghost' })).toContain('text-content-secondary')
  })

  it('carries the #44 vocabulary: filled secondary, solid danger, shadowed primary', () => {
    // Mobile's variant set (apps/mobile/components/ui/Button.tsx): secondary
    // is a FILL, not an outline — the step between primary and outline the
    // old four-variant set was missing.
    // Boundary-anchored, not toContain: `hover:bg-surface-inset/70` contains
    // the same substring, so a substring check stays green with the base fill
    // gone — proven by mutation during the #44 review.
    expect(buttonVariants({ variant: 'secondary' })).toMatch(/(?:^| )bg-surface-inset(?: |$)/)
    expect(buttonVariants({ variant: 'secondary' })).not.toContain('border')
    // Danger is SOLID (the commit treatment); danger-outline stays distinct
    // for restrained destructive entry points.
    expect(buttonVariants({ variant: 'danger' })).toMatch(/(?:^| )bg-feedback-danger-solid(?: |$)/)
    expect(buttonVariants({ variant: 'danger' })).not.toBe(
      buttonVariants({ variant: 'danger-outline' }),
    )
    // Primary carries the brand-tinted fab shadow — and sheds it disabled.
    expect(buttonVariants({ variant: 'primary' })).toContain('shadow-fab')
    expect(buttonVariants({ variant: 'primary' })).toContain('disabled:shadow-none')
    // Outline reads at full contrast now that secondary took the quiet slot.
    expect(buttonVariants({ variant: 'outline' })).toContain('text-content-primary')
  })

  it('draws mobile’s geometry and label by size: md 48px 12px 14/18, lg 52px 14px and the atom’s 15/20', () => {
    // apps/mobile/components/ui/Button.tsx: HEIGHTS 48/52, RADII 12/12/14/14
    // and LABEL_BY_SIZE 14/18 for sm/md, 15/20 for lg/xl — the atom
    // (`type-button`) carries 15/20, so only md overrides it. Boundary-anchored:
    // the override must be exactly the two classes, lg must carry neither, and
    // the height is a fixed box, not padding (34/44px measured before #59).
    const md = buttonVariants({ size: 'md' })
    const lg = buttonVariants({ size: 'lg' })
    for (const cls of [md, lg]) {
      expect(cls).toMatch(/(?:^| )type-button(?: |$)/)
      expect(cls).not.toMatch(/(?:^| )py-/)
    }
    expect(md).toMatch(/(?:^| )h-12(?: |$)/)
    expect(md).toMatch(/(?:^| )rounded-button(?: |$)/)
    expect(md).toMatch(/(?:^| )text-\[14px\](?: |$)/)
    expect(md).toMatch(/(?:^| )leading-\[18px\](?: |$)/)
    expect(lg).toMatch(/(?:^| )h-\[52px\](?: |$)/)
    expect(lg).toMatch(/(?:^| )rounded-button-lg(?: |$)/)
    expect(lg).not.toMatch(/text-\[|leading-\[/)
  })
})

describe('TextField', () => {
  it('associates the label and shows a field error only when present', () => {
    const { rerender } = render(<TextField label="Email" value="" onChange={() => {}} error={null} />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument()
    rerender(<TextField label="Email" value="" onChange={() => {}} error="Enter a valid email address" />)
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
  })

  it('sets the label through the shared Eyebrow, not its own type', () => {
    // `Eyebrow` has carried `as`/`htmlFor` since it shipped without a single
    // form using it; since #59c its letterforms are mobile's, through the
    // generated `type-eyebrow` atom. Class presence only; the computed
    // treatment is asserted in e2e, where a real browser resolves the font.
    render(<TextField label="First name" value="" onChange={() => {}} />)
    const label = screen.getByText('First name')
    expect(label.className).toContain('uppercase')
    // The shared eyebrow atom (#59c), not a tracking of its own.
    expect(label.className).toContain('type-eyebrow')
    // Not the comps' `content-tertiary`: 5.12:1 against the page where the
    // generated label token is 7.19:1, and this one is read while typing.
    expect(label.className).toContain('text-control-input-label')
  })

  it('sets the input at 16px, the size iOS Safari does not zoom', () => {
    // Below 16px, Safari zooms the viewport on focus and does not zoom back —
    // on the sign-in step that is the page jumping under someone's email.
    render(<TextField label="Email" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Email').className).toContain('text-base')
  })
})

describe('FormError', () => {
  it('renders nothing for null and the message otherwise', () => {
    const { rerender, container } = render(<FormError message={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<FormError message="boom" />)
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})

describe('cn', () => {
  it('merges conflicting tailwind classes with last-wins semantics', () => {
    expect(cn('px-4 py-3', 'py-2')).toBe('px-4 py-2')
  })
})
