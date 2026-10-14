/**
 * The views the page builds over the document.
 *
 * Two failures this catches, both silent: an operation whose tag the document
 * does not declare would simply not render, and an anchor that collided would
 * send a reader to the wrong endpoint.
 */
import { describe, expect, it } from 'vitest'
import { anchorFor, apiDocument as rendered, operationsByTag } from '@/lib/document'

describe('operationsByTag', () => {
  const tags = operationsByTag()

  it('keeps the document’s own tag order', () => {
    expect(tags.map((tag) => tag.name).slice(0, rendered.tags.length)).toEqual(
      rendered.tags.map((tag) => tag.name),
    )
  })

  it('lists every operation the document defines, exactly once', () => {
    const listed = tags.flatMap((tag) => tag.operations.map((entry) => entry.operation.operationId))
    const defined = Object.values(rendered.paths).flatMap((item) =>
      [item.get, item.post].filter((operation) => operation !== undefined).map((operation) => operation.operationId),
    )
    expect(listed.length).toBeGreaterThan(0)
    expect([...listed].sort()).toEqual([...defined].sort())
  })

  it('carries the method and path each operation is reached at', () => {
    for (const tag of tags) {
      for (const entry of tag.operations) {
        expect(['GET', 'POST']).toContain(entry.method)
        expect(rendered.paths[entry.path]).toBeDefined()
      }
    }
  })
})

describe('anchorFor', () => {
  it('is stable and unique per operation, so a link keeps working', () => {
    const anchors = operationsByTag().flatMap((tag) =>
      tag.operations.map((entry) => anchorFor(entry.operation.operationId)),
    )
    expect(new Set(anchors).size).toBe(anchors.length)
  })
})

describe('an operation whose tag the document does not declare', () => {
  /** The document, with one operation moved to a tag `tags` never lists. */
  const withOrphan = (): typeof rendered => {
    const [path, item] = Object.entries(rendered.paths)[0]
    const operation = item.get ?? item.post
    if (operation === undefined) throw new Error('the first path defines no operation')
    return {
      ...rendered,
      paths: { ...rendered.paths, [path]: { ...item, [item.get !== undefined ? 'get' : 'post']: { ...operation, tags: ['nowhere'] } } },
    }
  }

  it('is collected rather than dropped — a docs site must not silently omit an endpoint', () => {
    const tags = operationsByTag(withOrphan())
    const other = tags.find((tag) => tag.name === 'Other')
    expect(other, 'the orphan was dropped from the page').toBeDefined()
    expect(other?.operations.length).toBe(1)
    expect(other?.description).toMatch(/tag this document does not declare/i)
  })

  it('adds no "Other" group when every operation is tagged — the usual case', () => {
    expect(operationsByTag().some((tag) => tag.name === 'Other')).toBe(false)
  })
})
