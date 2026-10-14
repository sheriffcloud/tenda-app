/**
 * The guarantees, as a scannable table.
 *
 * The complaint this answers: eleven dense sentences in a flat list, with
 * nothing saying where to look. So what is held here is that each promise is
 * rendered UNDER its own subject, that the subjects are real text a reader can
 * scan and not decoration, and that a guarantee the document leaves without
 * one still renders whole rather than under an empty label.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DOCS_COPY } from '@/content'
import { STABILITY_FIELD, apiDocument } from '@/lib/document'
import { splitGuarantee } from '@/lib/guarantee'
import { Guarantees } from '@/components/docs/Guarantees'

const published = apiDocument.info[STABILITY_FIELD]

describe('Guarantees', () => {
  it('gives the section a real heading, not the eyebrow that captions a code block', () => {
    // It sat under a 10px uppercase label the same size as "RESPONSES", which
    // is part of why a section of the contract read as a caption over a wall.
    render(<Guarantees lines={published} />)
    expect(screen.getByRole('heading', { level: 2, name: DOCS_COPY.guarantees })).toBeTruthy()
  })

  it('renders one row per published guarantee, each under its own subject', () => {
    const { container } = render(<Guarantees lines={published} />)
    expect(container.querySelectorAll('dt')).toHaveLength(published.length)

    for (const line of published) {
      const { subject } = splitGuarantee(line)
      expect(screen.getByText(subject ?? ''), `no label for "${subject ?? ''}"`).toBeTruthy()
    }
  })

  it('renders each promise as MARKUP, so its emphasis is not asterisks on the page', () => {
    const { container } = render(<Guarantees lines={['**Auth.** The write surface is **bearer**-scoped.']} />)
    expect(screen.getByText('Auth')).toBeTruthy()
    expect(container.querySelector('dd strong')?.textContent).toBe('bearer')
    expect(container.textContent ?? '').not.toContain('**')
  })

  it('renders a subjectless guarantee whole, across both columns', () => {
    const plain = 'Amounts are base-unit integers carried as decimal strings.'
    const { container } = render(<Guarantees lines={[plain]} />)
    expect(container.querySelectorAll('dt')).toHaveLength(0)
    expect(screen.getByText(plain)).toBeTruthy()
    expect(container.querySelector('dd')?.getAttribute('style') ?? '').toContain('1 / -1')
  })

  it('says where to read the same guarantees in the JSON, with a COUNTED total', () => {
    // A hand-typed count is the first thing to drift when a guarantee is added.
    const { container } = render(<Guarantees lines={published} />)
    const lead = within(container).getByText(new RegExp(String(published.length)))
    expect(lead.textContent ?? '').toContain(STABILITY_FIELD)
  })

  it('rules BETWEEN the rows, so eleven promises are not one block of text', () => {
    const { container } = render(<Guarantees lines={published} />)
    expect(container.querySelector('.ruled-rows')).not.toBeNull()
  })
})
