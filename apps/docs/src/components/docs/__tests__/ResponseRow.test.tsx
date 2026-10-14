/**
 * One response row: which answers open, which fold away, and what stays in the
 * page either way.
 *
 * The task operation declares SEVEN responses, each with a body. Open, that
 * section is the longest thing on the site and the 402 — the one envelope a
 * caller has to sign — sits somewhere in the middle of it. So the answers a
 * caller writes code for open, and the refusals start folded.
 *
 * The folded body must still be IN the document: a reference is searched with
 * the browser's own find-in-page, and a panel that only exists once opened
 * cannot be found that way.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ResponseObject } from '@tenda/api-doc'
import { DOCS_COPY } from '@/content'
import { ResponseRow } from '@/components/docs/ResponseRow'
import { apiDocument } from '@/lib/document'

const schemas = apiDocument.components.schemas

const withBody = (description: string): ResponseObject => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
})

/**
 * The panel the disclosure hides: the row is a header and then the panel, so
 * this is the row's second child. Structural rather than a test id, because
 * `hidden` is only an ATTRIBUTE while it is closed — an open panel cannot be
 * found by the very property under test.
 */
const panel = (container: HTMLElement): HTMLElement =>
  container.firstElementChild?.children[1] as HTMLElement

describe('ResponseRow', () => {
  it.each([
    ['200', 'the settled answer'],
    ['201', 'the created answer'],
    ['402', 'the quote — the one body a caller must sign'],
  ])('opens %s, which is part of the flow (%s)', (status) => {
    const { container } = render(<ResponseRow status={status} response={withBody('Fine')} schemas={schemas} />)
    expect(panel(container).hidden).toBe(false)
    expect(screen.getByRole('button').textContent).toBe(DOCS_COPY.hideBody)
  })

  it.each(['400', '409', '422', '500', '503'])('folds %s away, which a caller handles rather than plans for', (status) => {
    const { container } = render(<ResponseRow status={status} response={withBody('Refused')} schemas={schemas} />)
    expect(panel(container).hidden).toBe(true)
    expect(screen.getByRole('button').textContent).toBe(DOCS_COPY.showBody)
  })

  it('keeps a folded body IN the page, so find-in-page still reaches it', () => {
    const { container } = render(<ResponseRow status="409" response={withBody('Conflict')} schemas={schemas} />)
    // Hidden, but present and complete — the envelope, filled from this status.
    expect(container.querySelector('pre')?.textContent ?? '').toContain('"statusCode": 409')
  })

  it('opens a folded body when the control is pressed, and folds it again', () => {
    const { container } = render(<ResponseRow status="422" response={withBody('Refused')} schemas={schemas} />)
    fireEvent.click(screen.getByRole('button'))
    expect(panel(container).hidden).toBe(false)
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(screen.getByRole('button'))
    expect(panel(container).hidden).toBe(true)
  })

  it('offers no control for a response that declares neither a body nor a header', () => {
    // A dead disclosure over an empty panel is the affordance this checks for.
    render(<ResponseRow status="204" response={{ description: 'No content' }} schemas={schemas} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('No content')).toBeTruthy()
  })

  it('shows the headers a response declares, inside the same panel', () => {
    const { container } = render(
      <ResponseRow
        status="201"
        response={{
          ...withBody('Created'),
          headers: { 'x-payment-response': { description: 'The relay receipt, base64.', schema: { type: 'string' } } },
        }}
        schemas={schemas}
      />,
    )
    expect(within(container).getByText('x-payment-response')).toBeTruthy()
    expect(within(container).getByText(DOCS_COPY.responseHeader)).toBeTruthy()
  })
})
