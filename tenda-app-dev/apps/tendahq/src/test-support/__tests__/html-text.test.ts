import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { asText } from '../html-text'

/**
 * The helper claims to reproduce React's escaping. That is checked against
 * React itself rather than against a table typed here, so a React release
 * that changes an entity fails this test instead of every test that uses it.
 */
describe('asText', () => {
  it('matches what React renders for every character it escapes', () => {
    const sample = `Tom & Jerry's "quote" <b> 5 > 3 — it’s fine`
    expect(asText(sample)).toBe(renderToStaticMarkup(createElement('i', null, sample)).slice(3, -4))
  })

  it('leaves text with nothing to escape untouched', () => {
    const plain = 'Held by the contract on 0G — eip155:16661. Neither party can move it.'
    expect(asText(plain)).toBe(plain)
    expect(asText('')).toBe('')
  })
})
