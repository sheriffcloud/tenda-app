/**
 * Every description the page renders, held to what its renderer actually does.
 *
 * This exists because of a defect nobody could see by reading the source. The
 * auth-message template was concatenated into a paragraph under the words
 * "build this message EXACTLY, newlines included" — and CommonMark folds the
 * single newlines of a paragraph into spaces, so the page printed the template
 * on ONE line. A reader who copied what the page showed signed the wrong bytes
 * and got a 401 that named no cause. The document was right; the render was
 * not, and nothing checked the difference.
 *
 * So the sweep is over the WHOLE document, and it is about the two ways a
 * description can be written against its renderer:
 *
 *   - fields the page renders as CommonMark must survive it — no folded line,
 *     no `<tag>` handed to `marked` to emit as an element and swallow, no
 *     unclosed code span, no marker left on the page as itself;
 *   - fields the page prints VERBATIM must carry no markdown, or a reader sees
 *     the backticks. Response descriptions are the sharp case: each is quoted
 *     into the `message` of that status's sample error body, so a backtick
 *     there is a backtick on the wire.
 *
 * Schema descriptions are deliberately NOT swept: no surface renders them yet
 * (the page shapes sample bodies from schemas but never lists their fields),
 * so holding them to a renderer none of them has would be a rule about
 * nothing. They carry markdown today, and the day a surface prints them this
 * sweep is where that decision gets made.
 */
import { marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { apiDocument, STABILITY_FIELD } from '@/lib/document'
import { splitGuarantee } from '@/lib/guarantee'

interface Field { where: string; text: string }

/** What the page hands to `Markdown`. */
function markdownFields(): Field[] {
  const out: Field[] = [{ where: 'info.description', text: apiDocument.info.description }]
  apiDocument.info[STABILITY_FIELD].forEach((line, i) => {
    out.push({ where: `${STABILITY_FIELD}[${i}]`, text: splitGuarantee(line).body })
  })
  for (const [path, item] of Object.entries(apiDocument.paths)) {
    for (const method of ['get', 'post'] as const) {
      const op = item[method]
      if (op === undefined) continue
      const at = `${method.toUpperCase()} ${path}`
      out.push({ where: `${at} description`, text: op.description })
      for (const parameter of op.parameters ?? []) {
        if (parameter.description !== undefined) out.push({ where: `${at} parameter ${parameter.name}`, text: parameter.description })
      }
      for (const [status, response] of Object.entries(op.responses)) {
        for (const [name, header] of Object.entries(response.headers ?? {})) {
          if (header.description !== undefined) out.push({ where: `${at} ${status} header ${name}`, text: header.description })
        }
      }
    }
  }
  return out
}

/** What the page prints exactly as the document wrote it. */
function plainFields(): Field[] {
  const out: Field[] = []
  for (const [path, item] of Object.entries(apiDocument.paths)) {
    for (const method of ['get', 'post'] as const) {
      const op = item[method]
      if (op === undefined) continue
      for (const [status, response] of Object.entries(op.responses)) {
        out.push({ where: `${method.toUpperCase()} ${path} ${status}`, text: response.description })
      }
    }
  }
  return out
}

/**
 * CommonMark separates blocks by a BLANK line; within one, a newline is a
 * space. A FENCE is the exception — it runs to its closing ``` and may hold
 * blank lines of its own, which is exactly what the auth-message template
 * does. Splitting on blank lines alone tore that fence into pieces and read
 * the pieces as folded paragraphs, so the walk below tracks the fence.
 */
function blocksOf(markdown: string): { text: string; fenced: boolean }[] {
  const out: { text: string; fenced: boolean }[] = []
  let current: string[] = []
  let fenced = false

  const flush = (wasFenced: boolean): void => {
    if (current.length > 0) out.push({ text: current.join('\n'), fenced: wasFenced })
    current = []
  }

  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      if (fenced) { current.push(line); flush(true); fenced = false; continue }
      flush(false)
      fenced = true
      current.push(line)
      continue
    }
    if (!fenced && line === '') { flush(false); continue }
    current.push(line)
  }
  flush(fenced)
  return out
}

const isList = (block: string): boolean => block.split('\n').every((line) => /^\s*(?:[-*+]|\d+\.)\s/.test(line))

/** The text a reader ends up with, once the renderer has had it. */
const renderedText = (markdown: string): string =>
  marked.parse(markdown, { async: false })
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

describe('the descriptions the page renders as CommonMark', () => {
  it('sweeps a document with something in it', () => {
    // Every case below is a filter. Without this they all pass on an empty
    // list, which is the shape a broken enumeration would take.
    expect(markdownFields().length).toBeGreaterThan(10)
    expect(plainFields().length).toBeGreaterThan(10)
  })

  it('loses no line to the newline fold', () => {
    // THE original defect. A paragraph carrying its own line breaks renders as
    // one long line; if the breaks matter, put it in a fence.
    const folded = markdownFields().filter(({ text }) =>
      blocksOf(text).some((block) => !block.fenced && !isList(block.text) && block.text.includes('\n')),
    )
    expect(folded.map((f) => f.where), 'a paragraph here carries newlines the renderer will eat — fence it').toEqual([])
  })

  it('hands the renderer no bare tag to swallow', () => {
    // `marked` emits raw HTML verbatim, so an unbackticked `<token>` becomes an
    // element and its text vanishes off the page entirely.
    const swallowed = markdownFields().filter(({ text }) =>
      /<[A-Za-z/][^>\s]*>/.test(text.replace(/`[^`]*`/g, '')),
    )
    expect(swallowed.map((f) => f.where), 'a bare <tag> outside a code span is emitted as HTML and disappears').toEqual([])
  })

  it('closes every code span it opens', () => {
    const unbalanced = markdownFields().filter(({ text }) => (text.match(/`/g) ?? []).length % 2 !== 0)
    expect(unbalanced.map((f) => f.where)).toEqual([])
  })

  it('leaves no marker on the page as itself', () => {
    const leaked = markdownFields().filter(({ text }) => {
      const shown = renderedText(text)
      return shown.includes('**') || shown.includes('`')
    })
    expect(leaked.map((f) => f.where), 'a marker survived the render — the reader sees it').toEqual([])
  })
})

describe('the descriptions the page prints verbatim', () => {
  it('carries no markdown, because there is nothing to render it', () => {
    // A response description is also the `message` of that status's sample
    // error body, so a backtick here is a backtick on the wire.
    const marked_ = plainFields().filter(({ text }) => /`|\*\*/.test(text))
    expect(marked_.map((f) => f.where), 'this is printed as-is: its markers reach the reader, and the sample body').toEqual([])
  })
})
