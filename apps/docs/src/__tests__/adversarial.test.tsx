/**
 * Hostile input, at the two boundaries this page has.
 *
 * The DOCUMENT is baked in, but the renderer must not assume more than the
 * types promise — a description is a string, and a string can be script,
 * markup, or a megabyte. The API's ANSWER is worse: `VITE_API_BASE_URL` points
 * the Run console at whatever host a build names, and that host's body reaches
 * `CodeBlock` unfiltered.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OperationObject } from '@tenda/api-doc'
import { Operation } from '@/components/docs/Operation'
import { RunPanel } from '@/components/docs/RunPanel'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { Markdown } from '@/components/docs/Markdown'
import { apiDocument } from '@/lib/document'
import { runOperation } from '@/lib/run'

const schemas = apiDocument.components.schemas
const base: OperationObject = {
  operationId: 'sample', summary: 'A sample operation', description: 'x', tags: ['gigs'],
  responses: { '200': { description: 'Fine' } },
}

describe('a hostile body from the API the console was pointed at', () => {
  it('renders a script tag as TEXT, never as markup', () => {
    const { container } = render(<CodeBlock value={{ note: '</pre><script>window.__x=1</script>' }} />)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/window.__x=1/)).toBeTruthy()
  })

  it('survives a body that is a bare string, a number, an array or null', () => {
    for (const value of ['plain', 42, [1, 2], null, true]) {
      const { container, unmount } = render(<CodeBlock value={value} />)
      expect(container.querySelector('pre')).toBeTruthy()
      unmount()
    }
  })

  it('does not widen the page for a value with no break in it', () => {
    const { container } = render(<CodeBlock value={{ sig: 'a'.repeat(4000) }} />)
    const pre = container.querySelector('pre')
    expect(pre?.className, 'a body without overflow-x pushes the whole reference sideways').toContain('overflow-x-auto')
  })

  it('reports a host that answers a redirect-shaped nothing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 302, text: () => Promise.resolve('') } as Response)
    const outcome = await runOperation({
      api: 'https://elsewhere.test', method: 'GET', path: '/v1/gigs', operation: base, fetchImpl, now: () => 0,
    })
    expect(outcome).toMatchObject({ ok: true, result: { status: 302, body: null } })
  })

  /**
   * A session answer that is not `{ token: "<string>" }` — three shapes a host
   * can send. Each must STOP the run: the operation itself is never sent, so
   * no request goes out carrying `Bearer undefined` or `Bearer [object
   * Object]` for a reader to puzzle over. Asserting the second call never
   * happens is the part that can fail; the refusal alone cannot, because a
   * missing key reads as undefined whatever the container is.
   */
  it.each([
    ['a nested object', '{"token":{"nested":1}}'],
    ['an array', '[{"token":"x"}]'],
    ['a bare string', '"granted"'],
  ])('refuses a demo session that answers %s, and sends nothing after it', async (_shape, body) => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 201, text: () => Promise.resolve(body) } as Response)
    const outcome = await runOperation({
      api: 'https://elsewhere.test', method: 'POST', path: '/v1/agent/tasks',
      operation: { ...base, security: [{ bearer: [] }] }, fetchImpl, now: () => 0,
    })
    expect(outcome.ok).toBe(false)
    expect(fetchImpl, 'the operation was sent with an unusable token').toHaveBeenCalledTimes(1)
  })
})

describe('a document whose strings are not what a docs page expects', () => {
  it('renders an operation whose description is empty and whose summary is only spaces', () => {
    render(<Operation method="GET" path="/v1/x" operation={{ ...base, summary: '   ', description: '' }} schemas={schemas} />)
    expect(screen.getByText('/v1/x')).toBeTruthy()
  })

  it('renders a status the reason-phrase register has never seen, without inventing one', () => {
    const odd: OperationObject = {
      ...base,
      responses: { '418': { description: 'Teapot', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } } },
    }
    const { container } = render(<Operation method="GET" path="/v1/x" operation={odd} schemas={schemas} />)
    const body = [...container.querySelectorAll('pre')].map((p) => p.textContent ?? '').join('')
    expect(body).toContain('"statusCode": 418')
    // No phrase is known for 418, so the schema's own placeholder stands —
    // never `undefined`, which is what a bracket read would have produced.
    expect(body).not.toContain('undefined')
  })

  it('does not let a path that only LOOKS parameterised through the Run gate', () => {
    render(<RunPanel method="GET" path="/v1/gigs?filter={x}" operation={base} />)
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
  })

  it('renders the document’s markdown as markup', () => {
    const { container } = render(<Markdown>{'**bold** and `code`'}</Markdown>)
    expect(container.querySelector('strong')).toBeTruthy()
    expect(container.querySelector('code')).toBeTruthy()
  })

  it('keeps dangerouslySetInnerHTML to the ONE component whose docblock justifies it', () => {
    // `marked` emits raw HTML verbatim — MEASURED: a `<script>` in a
    // description becomes a real element. That is safe only while the input is
    // the document this repo authors and bakes in, which is exactly what
    // Markdown.tsx's header says and what this holds it to. A second use of
    // the escape hatch — a fetched document, a viewer's string — is the change
    // that would make it unsafe, and it fails here first.
    //
    // One root: `src` already contains components, lib and theme. Generated
    // data, the harness's stubs and the tests themselves are skipped — none of
    // them is shipped markup.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return ['generated', 'test-support', '__tests__'].includes(entry.name) ? [] : walk(full)
        return /\.tsx?$/.test(entry.name) ? [full] : []
      })

    const files = walk('src')
    expect(files.length, 'the walk found nothing — it would pass vacuously').toBeGreaterThan(10)
    const users = files.filter((file) => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'))
    expect(users).toEqual(['src/components/docs/Markdown.tsx'])
  })
})
