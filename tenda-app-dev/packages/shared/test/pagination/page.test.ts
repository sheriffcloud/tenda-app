/** Ported from apps/mobile/lib/pagination/__tests__/page.test.ts at the move. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasMore, hasMorePages, mergeById, nextOffset } from '../../src/pagination'

interface Row {
  id: string
  label?: string
}
const keyOf = (row: Row) => row.id

test('mergeById: appends rows that are not already present, preserving order', () => {
  const existing: Row[] = [{ id: 'a' }, { id: 'b' }]
  const incoming: Row[] = [{ id: 'c' }, { id: 'd' }]
  assert.deepEqual(mergeById(existing, incoming, keyOf).map(keyOf), ['a', 'b', 'c', 'd'])
})

test('mergeById: drops rows already loaded — the shifted-window duplicate-key case', () => {
  const existing: Row[] = [{ id: 'a' }, { id: 'b' }]
  const incoming: Row[] = [{ id: 'b' }, { id: 'c' }]
  assert.deepEqual(mergeById(existing, incoming, keyOf).map(keyOf), ['a', 'b', 'c'])
})

test('mergeById: drops duplicates WITHIN a single incoming page', () => {
  const incoming: Row[] = [{ id: 'a' }, { id: 'a' }, { id: 'b' }]
  assert.deepEqual(mergeById([], incoming, keyOf).map(keyOf), ['a', 'b'])
})

test('mergeById: keeps the FIRST occurrence so on-screen rows never swap mid-scroll', () => {
  const existing: Row[] = [{ id: 'a', label: 'original' }]
  const incoming: Row[] = [{ id: 'a', label: 'updated' }]
  assert.equal(mergeById(existing, incoming, keyOf)[0].label, 'original')
})

test('mergeById: returns the existing array unchanged when nothing is new', () => {
  const existing: Row[] = [{ id: 'a' }]
  assert.equal(mergeById(existing, [], keyOf), existing)
  assert.equal(mergeById(existing, [{ id: 'a' }], keyOf), existing)
})

test('mergeById: handles an empty existing list and never yields duplicate keys', () => {
  assert.deepEqual(mergeById([], [{ id: 'a' }], keyOf).map(keyOf), ['a'])
  const merged = mergeById([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }], keyOf)
  assert.equal(new Set(merged.map(keyOf)).size, merged.length)
})

test('hasMore: true before the total, false at the boundary, past it, and when empty', () => {
  assert.equal(hasMore(20, 45), true)
  assert.equal(hasMore(45, 45), false)
  assert.equal(hasMore(60, 45), false)
  assert.equal(hasMore(0, 0), false)
  assert.equal(hasMore(0, 1), true)
})

test('nextOffset: advances by what the server returned, including short and empty pages', () => {
  assert.equal(nextOffset(20, 20), 40)
  assert.equal(nextOffset(40, 5), 45)
  assert.equal(nextOffset(40, 0), 40)
})

// ── hasMorePages: the cursor-aware rule both clients ask ────────────────────

test('hasMorePages: offset pagination ignores the cursor entirely', () => {
  const args = { cursorPagination: false, nextCursor: null, offset: 2, total: 5 }
  assert.equal(hasMorePages(args), true)
  assert.equal(hasMorePages({ ...args, offset: 5 }), false)
})

test('hasMorePages: a null cursor is the server saying this is the end', () => {
  // Even with rows still unloaded by the offset count — the cursor wins.
  assert.equal(
    hasMorePages({ cursorPagination: true, nextCursor: null, offset: 2, total: 99 }),
    false,
  )
})

test('hasMorePages: a cursor string means another page, whatever the offsets say', () => {
  assert.equal(
    hasMorePages({ cursorPagination: true, nextCursor: 'c-2', offset: 99, total: 2 }),
    true,
  )
})

test('hasMorePages: no cursor AT ALL falls back to offsets', () => {
  // `undefined` is a third state, distinct from null: this server does not do
  // cursors. Collapsing it into the cursor branch makes hasMore permanently
  // true — an endless Load more.
  assert.equal(
    hasMorePages({ cursorPagination: true, nextCursor: undefined, offset: 2, total: 5 }),
    true,
  )
  assert.equal(
    hasMorePages({ cursorPagination: true, nextCursor: undefined, offset: 5, total: 5 }),
    false,
  )
})

test('hasMorePages: agrees with hasMore on every offset-shaped input', () => {
  // The two must not drift: hasMorePages is the same rule with a cursor lane.
  for (const [offset, total] of [[0, 0], [0, 1], [1, 1], [3, 10], [10, 10], [11, 10]]) {
    assert.equal(
      hasMorePages({ cursorPagination: false, nextCursor: undefined, offset, total }),
      hasMore(offset, total),
    )
  }
})
