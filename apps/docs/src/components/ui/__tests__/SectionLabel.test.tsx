/**
 * The eyebrow is a type role, and on this page it is also HEADING structure.
 *
 * `as` is why the component takes a prop at all: "Responses" and "Parameters"
 * introduce sections and must be headings a screen reader can jump between,
 * while a tag name in the rail and a caption on a code block are labels, not
 * headings. Ignore `as` and every one of them silently becomes a span — the
 * page still looks right and its outline is gone, which is precisely the
 * failure no screenshot shows.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionLabel } from '@/components/ui/SectionLabel'

describe('SectionLabel', () => {
  it('is a span by default — a caption, not part of the outline', () => {
    const { container } = render(<SectionLabel>Recorded</SectionLabel>)
    expect(container.querySelector('span')?.textContent).toBe('Recorded')
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('becomes the heading level it is asked for', () => {
    for (const [as, level] of [['h2', 2], ['h4', 4]] as const) {
      const { unmount } = render(<SectionLabel as={as}>Responses</SectionLabel>)
      expect(screen.getByRole('heading', { level, name: 'Responses' })).toBeTruthy()
      unmount()
    }
  })

  it('wears the same type treatment whichever element it is', () => {
    // The point of one component: an h4 label and a span label must not drift
    // apart the first time one call site is adjusted.
    const heading = render(<SectionLabel as="h4">Responses</SectionLabel>)
    const headingClass = heading.container.firstElementChild?.className
    heading.unmount()
    const caption = render(<SectionLabel>Responses</SectionLabel>)
    expect(caption.container.firstElementChild?.className).toBe(headingClass)
  })
})
