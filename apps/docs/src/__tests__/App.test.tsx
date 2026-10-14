/**
 * The page shows the whole contract, and shows it as the document wrote it.
 *
 * The failure to guard against is not a broken layout — it is an endpoint that
 * quietly does not render, or prose printed with its asterisks showing because
 * nothing turned the CommonMark into markup. Both look fine in a screenshot of
 * the parts that DID work.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '@/App'
import { DOCS_COPY } from '@/content'
import { apiBaseUrl } from '@/env'
import { STABILITY_FIELD, anchorFor, apiDocument, operationsByTag } from '@/lib/document'
import { splitGuarantee } from '@/lib/guarantee'

/**
 * The document's markdown as the PAGE renders it. `**` and backticks are
 * markers, not text, so the rendered row carries the words and neither of
 * them — but ONLY as delimiters: the auth guarantee contains
 * `POST /v1/agent/*`, whose asterisk is part of the path. Code spans are
 * unwrapped FIRST for exactly that reason, so what they hold is text by the
 * time emphasis is looked for.
 *
 * Compared whole rather than by fragment, so a promise that silently fails to
 * render cannot pass by containing one matching word.
 */
const asRendered = (markdown: string): string =>
  markdown.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1')

describe('the docs page', () => {
  it('names the document and the version an agent is integrating against', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: apiDocument.info.title })).toBeTruthy()
    expect(screen.getByText(`v${apiDocument.info.version}`)).toBeTruthy()
  })

  it('renders every operation the document defines, with its path and an anchor', () => {
    const { container } = render(<App />)
    const listed = operationsByTag().flatMap((tag) => tag.operations)
    expect(listed.length).toBeGreaterThan(0)
    for (const { operation, path } of listed) {
      // Attribute selector, not `#id`: an id needs escaping in a CSS selector
      // and `CSS.escape` is not in jsdom, so this is the form that works in
      // both the browser and the test environment.
      const article = container.querySelector(`[id="${anchorFor(operation.operationId)}"]`)
      expect(article, `${operation.operationId} does not render`).not.toBeNull()
      expect(within(article as HTMLElement).getByText(path)).toBeTruthy()
    }
  })

  it('renders the description as MARKUP, not as asterisks on the page', () => {
    // The integration guide lives in info.description (#157 stage 3), so its
    // headings and bold runs are the proof the renderer is wired.
    const { container } = render(<App />)
    const prose = container.querySelector('.prose-doc')
    expect(prose).not.toBeNull()
    expect(prose?.querySelector('h2')).not.toBeNull()
    expect(prose?.querySelector('strong')).not.toBeNull()
    expect(prose?.textContent ?? '').not.toContain('**')
  })

  it('tells a reader WHERE to send the paths it lists', () => {
    // Every path on this page is relative. Without the origin a reader has the
    // whole contract and nowhere to send it — which is how the page shipped.
    render(<App />)
    expect(screen.getByRole('heading', { name: DOCS_COPY.baseUrl })).toBeTruthy()
    expect(screen.getByText(apiBaseUrl())).toBeTruthy()
  })

  it('shows the guide itself, not just the purpose line', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /Posting a task, end to end/i })).toBeTruthy()
  })

  it('states every stability guarantee the document publishes', () => {
    // Asserted through the SPLIT, because the page no longer prints the raw
    // string: each guarantee's subject is lifted into a label and its promise
    // rendered as markup. Both halves must still be on the page — a guarantee
    // that renders as a label with nothing under it, or a promise with its
    // subject dropped, is a guarantee the reader half has.
    render(<App />)
    for (const line of apiDocument.info[STABILITY_FIELD]) {
      const { subject, body } = splitGuarantee(line)
      expect(screen.getByText(subject ?? ''), `no subject for "${line}"`).toBeTruthy()
      expect(
        screen.getByText((_content, element) => element?.textContent === asRendered(body)),
        `no promise for "${subject ?? ''}"`,
      ).toBeTruthy()
    }
  })

  it('lists every operation in the rail by PATH — what an integrator scans for', () => {
    const { container } = render(<App />)
    for (const { operation } of operationsByTag().flatMap((tag) => tag.operations)) {
      const anchor = anchorFor(operation.operationId)
      expect(container.querySelector(`a[href="#${anchor}"]`), `no rail link to ${anchor}`).not.toBeNull()
      expect(container.querySelector(`[id="${anchor}"]`), `no target for ${anchor}`).not.toBeNull()
    }
  })
})
