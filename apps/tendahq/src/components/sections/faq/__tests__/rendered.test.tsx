import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { asText } from '@/test-support/html-text'
import { FAQ } from '../FAQ'
import { FaqList } from '../FaqList'
import { FAQ_CATEGORIES, FAQ_HEADER } from '../content'

/**
 * The FAQ is one ruled list: every question from every category, tagged with
 * its category, the first one open so the page is at rest with an answer
 * showing.
 */
const html = renderToStaticMarkup(<FAQ surface="base" />)
const questions = FAQ_CATEGORIES.flatMap((c) => c.questions)

describe('§07 FAQ', () => {
  it('renders every question from every category, in order', () => {
    const positions = questions.map((q) => html.indexOf(`faq-q-${q.id}`))
    for (const at of positions) expect(at).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('tags each question with its category, in the margin', () => {
    for (const category of FAQ_CATEGORIES) expect(html).toContain(asText(category.title))
  })

  it('opens exactly the first question, and hides the rest', () => {
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1)
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(questions.length - 1)
    expect(html.match(/ hidden=""/g)).toHaveLength(questions.length - 1)
    expect(html.indexOf('aria-expanded="true"')).toBeLessThan(html.indexOf('aria-expanded="false"'))
  })

  it('carries the rule, the headline and the aside', () => {
    expect(html).toContain(FAQ_HEADER.eyebrow)
    expect(html).toContain(FAQ_HEADER.h2.lead)
    expect(html).toContain(asText(FAQ_HEADER.aside))
  })

  it('renders an empty list, with nothing open, when there are no questions', () => {
    const empty = renderToStaticMarkup(<FaqList categories={[]} />)
    expect(empty).not.toContain('aria-expanded')
    expect(empty).not.toContain('role="region"')
  })
})
