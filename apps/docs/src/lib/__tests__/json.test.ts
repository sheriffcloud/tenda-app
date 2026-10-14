/**
 * The two ways this app reads JSON it did not construct.
 *
 * Both exist to refuse something the language does silently. `lookup` refuses
 * the prototype: `'toString' in {}` is true and `({}).toString` is a FUNCTION,
 * so a bracket read keyed by a document's own strings can hand back an
 * inherited method that every `=== undefined` guard behind it waves through.
 * `asRecord` refuses an array, because `typeof [] === 'object'` and spreading
 * an array into an object body turns it into `{ "0": … }`.
 *
 * Tested directly rather than only through their callers: a caller can only
 * reach the hazard with a key or a body it happens to produce today.
 */
import { describe, expect, it } from 'vitest'
import { asRecord, lookup } from '@/lib/json'

describe('lookup', () => {
  const book: Readonly<Record<string, string>> = { '409': 'Conflict' }

  it('answers the value at a key the record owns', () => {
    expect(lookup(book, '409')).toBe('Conflict')
  })

  it('answers undefined for a key it does not own', () => {
    expect(lookup(book, '418')).toBeUndefined()
  })

  it('answers undefined for a key the PROTOTYPE owns', () => {
    for (const inherited of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(lookup(book, inherited), `${inherited} came back from the prototype`).toBeUndefined()
    }
  })

  it('answers an own key even when its value is falsy', () => {
    // `record[key] || undefined` would lose these; `Object.hasOwn` does not.
    expect(lookup({ a: '' }, 'a')).toBe('')
    expect(lookup({ a: 0 }, 'a')).toBe(0)
    expect(lookup({ a: false }, 'a')).toBe(false)
  })
})

describe('asRecord', () => {
  it('narrows a JSON object', () => {
    expect(asRecord({ token: 'demo' })).toEqual({ token: 'demo' })
  })

  it('refuses an array — typeof [] is "object", and spreading one yields { "0": … }', () => {
    expect(asRecord([])).toBeNull()
    expect(asRecord([{ token: 'demo' }])).toBeNull()
  })

  it('refuses null and every scalar', () => {
    for (const value of [null, 'text', 0, 42, true, false]) {
      expect(asRecord(value), `${JSON.stringify(value)} narrowed to an object`).toBeNull()
    }
  })
})
