/**
 * The list both the parameters and the response headers are drawn with.
 *
 * What is worth holding: that an OPTIONAL part of a field is absent when the
 * document does not supply it, that a recorded value survives whatever type
 * the document recorded it as, and — since the row rework — that "required" is
 * its own mark rather than a word buried in a qualifier string. A parameter
 * example is usually a string (the X-PAYMENT header's base64), but nothing in
 * the document's own types says it must be, and a value rendered as
 * `[object Object]` is worse than none.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DOCS_COPY } from '@/content'
import { FieldList } from '@/components/ui/FieldList'

describe('FieldList', () => {
  it('renders a field that is nothing but a name', () => {
    const { container } = render(<FieldList fields={[{ name: 'cursor' }]} />)
    expect(screen.getByText('cursor')).toBeTruthy()
    // No qualifier, no sentence, no value — one <dt> and no <dd>.
    expect(container.querySelectorAll('dd')).toHaveLength(0)
  })

  it('renders the qualifier, the sentence and the recorded value when it has them', () => {
    render(<FieldList fields={[{ name: 'x-payment', kind: 'header', required: true, description: 'The signed authorisation.', example: 'eyJhIjoxfQ==' }]} />)
    expect(screen.getByText('header')).toBeTruthy()
    expect(screen.getByText(DOCS_COPY.required)).toBeTruthy()
    expect(screen.getByText('The signed authorisation.')).toBeTruthy()
    expect(screen.getByText('eyJhIjoxfQ==')).toBeTruthy()
  })

  it('marks ONLY the required fields, so a list can be scanned for them', () => {
    // The mark used to be half of a pre-joined string ("header · required"),
    // which a reader had to read to find. An optional field must carry no mark
    // at all, or the mark says nothing.
    render(
      <FieldList fields={[
        { name: 'x-payment', kind: 'header', required: false },
        { name: 'cursor', kind: 'query', required: true },
      ]} />,
    )
    expect(screen.getAllByText(DOCS_COPY.required)).toHaveLength(1)
  })

  it('shows a non-string recorded value as JSON rather than as [object Object]', () => {
    render(<FieldList fields={[{ name: 'limit', example: 25 }, { name: 'filter', example: { remote: true } }]} />)
    expect(screen.getByText('25')).toBeTruthy()
    expect(screen.getByText('{"remote":true}')).toBeTruthy()
  })

  it('keeps two fields of the same name apart by where they live', () => {
    // `status` can be both a query key and a header. Keyed by name alone React
    // still RENDERS both — it only warns — so counting rows proves nothing;
    // the warning is the observable, and it means reconciliation is unsound.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { container } = render(
      <FieldList fields={[{ name: 'status', kind: 'query' }, { name: 'status', kind: 'header' }]} />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(2)
    const duplicateKey = warn.mock.calls.flat().some((arg) => String(arg).includes('same key'))
    expect(duplicateKey, 'two rows share a React key — the list cannot reconcile').toBe(false)
    warn.mockRestore()
  })

  it('rules BETWEEN the rows, so a long parameter list has breaks in it', () => {
    // The complaint the rework answers: a run-on list with nothing separating
    // one field from the next. The class is what draws the rule; without it
    // every row is flush against its neighbour again.
    const { container } = render(<FieldList fields={[{ name: 'a' }, { name: 'b' }]} />)
    expect(container.querySelector('.ruled-rows')).not.toBeNull()
  })
})
