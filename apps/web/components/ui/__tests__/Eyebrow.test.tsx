import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Eyebrow, EYEBROW_ATOM, EYEBROW_STRONG_ATOM } from '@/components/ui/Eyebrow'

describe('Eyebrow', () => {
  it('carries mobile’s letterforms through the generated eyebrow atom, uppercase', () => {
    render(<Eyebrow>Locked in escrow</Eyebrow>)
    const el = screen.getByText('Locked in escrow')
    expect(EYEBROW_ATOM).toBe('type-eyebrow uppercase')
    expect(el.className).toContain('type-eyebrow')
    expect(el.className).toContain('uppercase')
    // No local size, weight or tracking: the atom owns all four, so none can
    // drift here (#59c). The #44 body-face tracking is gone with it.
    expect(el.className).not.toMatch(/text-\[|text-xs|font-medium|tracking-|leading-/)
  })

  it('is a paragraph by default — a label is not automatically a heading', () => {
    render(<Eyebrow>Amount</Eyebrow>)
    expect(screen.getByText('Amount').tagName).toBe('P')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('publishes a heading only when asked to', () => {
    render(<Eyebrow as="h2">Terms</Eyebrow>)
    expect(screen.getByRole('heading', { level: 2, name: 'Terms' })).toBeInTheDocument()
  })

  it('labels a control when used as a label', () => {
    render(
      <>
        <Eyebrow as="label" htmlFor="sort">
          Sort
        </Eyebrow>
        <select id="sort" />
      </>,
    )
    expect(screen.getByLabelText('Sort')).toBeInTheDocument()
  })

  it('does not emit htmlFor on a non-label tag', () => {
    render(<Eyebrow>Plain</Eyebrow>)
    expect(screen.getByText('Plain')).not.toHaveAttribute('for')
  })

  it('tones without leaving the token palette', () => {
    render(<Eyebrow tone="warning">Closing</Eyebrow>)
    expect(screen.getByText('Closing').className).toContain('text-feedback-warning-text')
  })

  it('maps the counted variant to mobile’s label style, sentence case', () => {
    render(<Eyebrow strong>4 unread</Eyebrow>)
    const el = screen.getByText('4 unread')
    expect(EYEBROW_STRONG_ATOM).toBe('type-label')
    expect(el.className).toContain('type-label')
    expect(el.className).not.toContain('type-eyebrow')
    expect(el.className).not.toContain('uppercase')
  })

  it('lets a caller override the colour — category tones are dynamic', () => {
    // twMerge must drop the default tone rather than emit both.
    render(<Eyebrow className="text-category-photo-base">Photo</Eyebrow>)
    const className = screen.getByText('Photo').className
    expect(className).toContain('text-category-photo-base')
    expect(className).not.toContain('text-content-tertiary')
  })
})
