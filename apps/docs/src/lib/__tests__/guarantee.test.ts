/**
 * Splitting a guarantee into its subject and its promise.
 *
 * The parse is anchored and non-greedy for a reason: several real guarantees
 * carry em dashes, colons, parentheses and `**` emphasis INSIDE them, and a
 * separator that matched any of those would cut a sentence in half and put its
 * middle in the label column. The cases below are the shapes the document
 * actually contains, plus the two it might grow.
 */
import { describe, expect, it } from 'vitest'
import { apiDocument } from '@/lib/document'
import { splitGuarantee } from '@/lib/guarantee'
import { STABILITY_FIELD } from '@/lib/document'

describe('splitGuarantee', () => {
  it('lifts the leading bold run and drops its full stop', () => {
    expect(splitGuarantee('**Auth.** The read surface is anonymous.'))
      .toEqual({ subject: 'Auth', body: 'The read surface is anonymous.' })
  })

  it('keeps a subject that never had a full stop', () => {
    expect(splitGuarantee('**Chain ids** are not enumerated.'))
      .toEqual({ subject: 'Chain ids', body: 'are not enumerated.' })
  })

  it('stops at the FIRST closing run, not the last', () => {
    // Bold inside the promise is the trap: greedy matching would make the
    // subject "Paths.** Frozen for **v1" and leave the sentence in ruins.
    expect(splitGuarantee('**Paths.** Frozen for the **v1** line.'))
      .toEqual({ subject: 'Paths', body: 'Frozen for the **v1** line.' })
  })

  it('leaves a guarantee with no subject whole', () => {
    const plain = 'Amounts are base-unit integers carried as decimal strings.'
    expect(splitGuarantee(plain)).toEqual({ subject: null, body: plain })
  })

  it('leaves a guarantee that is ONLY a bold run whole, rather than labelling nothing', () => {
    // A label with an empty cell beside it is worse than an emphasised line.
    expect(splitGuarantee('**Everything may change.**'))
      .toEqual({ subject: null, body: '**Everything may change.**' })
  })

  it('is not fooled by emphasis that starts later in the sentence', () => {
    const mid = 'New paths may be **ADDED**.'
    expect(splitGuarantee(mid)).toEqual({ subject: null, body: mid })
  })
})

describe('the document this parse is written for', () => {
  it('gives EVERY published guarantee a subject', () => {
    // The page renders a subjectless guarantee across both columns, which is
    // correct but is not the design. If the document grows one without a
    // subject, this says so here rather than leaving a ragged row on the page.
    const lines = apiDocument.info[STABILITY_FIELD]
    expect(lines.length).toBeGreaterThan(0)
    const missing = lines.filter((line) => splitGuarantee(line).subject === null)
    expect(missing, 'these guarantees would render without a label').toEqual([])
  })

  it('keeps every subject short enough to be a label rather than a sentence', () => {
    // The column is 9.5rem. A subject that wraps to three lines stops being a
    // scanning aid and becomes a second copy of the promise.
    for (const line of apiDocument.info[STABILITY_FIELD]) {
      const { subject } = splitGuarantee(line)
      expect((subject ?? '').length, `"${subject ?? ''}" is too long for the label column`).toBeLessThanOrEqual(24)
    }
  })

  it('leaves no guarantee with an empty promise under its label', () => {
    for (const line of apiDocument.info[STABILITY_FIELD]) {
      expect(splitGuarantee(line).body.trim().length).toBeGreaterThan(0)
    }
  })
})
