import { mergeById, hasMore, nextOffset } from '@/lib/pagination'

interface Row { id: string; label?: string }
const keyOf = (r: Row) => r.id

describe('mergeById', () => {
  it('appends rows that are not already present, preserving order', () => {
    const existing: Row[] = [{ id: 'a' }, { id: 'b' }]
    const incoming: Row[] = [{ id: 'c' }, { id: 'd' }]
    expect(mergeById(existing, incoming, keyOf).map(keyOf)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops rows already loaded — the shifted-window duplicate-key case', () => {
    // A row inserted at the top between page 1 and page 2 pushes 'b' into
    // page 2's window, so the server legitimately returns it twice.
    const existing: Row[] = [{ id: 'a' }, { id: 'b' }]
    const incoming: Row[] = [{ id: 'b' }, { id: 'c' }]
    expect(mergeById(existing, incoming, keyOf).map(keyOf)).toEqual(['a', 'b', 'c'])
  })

  it('drops duplicates WITHIN a single incoming page', () => {
    const incoming: Row[] = [{ id: 'a' }, { id: 'a' }, { id: 'b' }]
    expect(mergeById([], incoming, keyOf).map(keyOf)).toEqual(['a', 'b'])
  })

  it('keeps the FIRST occurrence so on-screen rows never swap mid-scroll', () => {
    const existing: Row[] = [{ id: 'a', label: 'original' }]
    const incoming: Row[] = [{ id: 'a', label: 'updated' }]
    expect(mergeById(existing, incoming, keyOf)[0].label).toBe('original')
  })

  it('returns the existing array unchanged when nothing is new', () => {
    const existing: Row[] = [{ id: 'a' }]
    expect(mergeById(existing, [], keyOf)).toBe(existing)
    expect(mergeById(existing, [{ id: 'a' }], keyOf)).toBe(existing)
  })

  it('handles an empty existing list', () => {
    expect(mergeById([], [{ id: 'a' }], keyOf).map(keyOf)).toEqual(['a'])
  })

  it('produces no duplicate keys across an all-duplicate page', () => {
    const existing: Row[] = [{ id: 'a' }, { id: 'b' }]
    const merged = mergeById(existing, [{ id: 'a' }, { id: 'b' }], keyOf)
    expect(new Set(merged.map(keyOf)).size).toBe(merged.length)
  })
})

describe('hasMore', () => {
  it('is true while the cursor sits before the total', () => {
    expect(hasMore(20, 45)).toBe(true)
  })

  it('is false at the exact boundary — the off-by-one that causes a dead extra fetch', () => {
    expect(hasMore(45, 45)).toBe(false)
  })

  it('is false past the total (server total shrank under us)', () => {
    expect(hasMore(60, 45)).toBe(false)
  })

  it('is false for an empty result set', () => {
    expect(hasMore(0, 0)).toBe(false)
  })

  it('is true for a fresh list with rows available', () => {
    expect(hasMore(0, 1)).toBe(true)
  })
})

describe('nextOffset', () => {
  it('advances by what the server returned, not by the requested page size', () => {
    expect(nextOffset(20, 20)).toBe(40)
  })

  it('advances by the real length on a short final page', () => {
    expect(nextOffset(40, 5)).toBe(45)
  })

  it('does not advance on an empty page', () => {
    expect(nextOffset(40, 0)).toBe(40)
  })
})
