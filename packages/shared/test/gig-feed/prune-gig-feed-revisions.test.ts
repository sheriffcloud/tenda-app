/**
 * The feed's revision memory is bounded (#73): current rows always, the most
 * recently departed up to the memory, nothing older.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PAGINATION_LIMIT } from '../../src/utils/validation'
import { GIG_FEED_REVISION_MEMORY, pruneGigFeedRevisions } from '../../src/gig-feed/prune-gig-feed-revisions'

const map = (n: number, prefix = 'g'): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, String(i)]))

test('the memory is derived from the server page cap, never typed', () => {
  assert.equal(GIG_FEED_REVISION_MEMORY, MAX_PAGINATION_LIMIT * 2)
  assert.ok(GIG_FEED_REVISION_MEMORY > 0)
})

test('under the memory nothing is forgotten, and a map already in departure order comes back as the same object', () => {
  const revisions = map(5)
  assert.equal(pruneGigFeedRevisions(revisions, [], 5), revisions)
  // A current row in the FRONT slot is out of departure order (departed rows
  // sit first), so the map is rebuilt — but nothing is forgotten by it.
  const reordered = pruneGigFeedRevisions(revisions, ['g0'], 4)
  assert.notEqual(reordered, revisions)
  assert.deepEqual(Object.keys(reordered), ['g1', 'g2', 'g3', 'g4', 'g0'])
  // And once in order, the same object again.
  assert.equal(pruneGigFeedRevisions(reordered, ['g0'], 4), reordered)
})

test('over the memory the OLDEST departed go first, the newest departed stay', () => {
  const pruned = pruneGigFeedRevisions(map(10), [], 3)
  assert.deepEqual(Object.keys(pruned), ['g7', 'g8', 'g9'])
})

test('a current row is kept however many others are remembered — even at memory 0', () => {
  const pruned = pruneGigFeedRevisions(map(10), ['g0', 'g4'], 0)
  assert.deepEqual(Object.keys(pruned), ['g0', 'g4'])
  assert.equal(pruned.g4, '4', 'the revision itself is untouched')
})

test('current rows do not spend the memory: departed entries are counted on their own', () => {
  // 6 current + 4 departed with memory 4 → nothing forgotten, though 10 > 4.
  const revisions = map(10)
  const current = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5']
  assert.deepEqual(Object.keys(pruneGigFeedRevisions(revisions, current, 4)).sort(), Object.keys(revisions).sort())
  // memory 3 → exactly the oldest departed (g6) goes; departed first, then current.
  assert.deepEqual(Object.keys(pruneGigFeedRevisions(revisions, current, 3)), ['g7', 'g8', 'g9', 'g0', 'g1', 'g2', 'g3', 'g4', 'g5'])
})

test('a negative memory reads as zero rather than keeping everything', () => {
  assert.deepEqual(Object.keys(pruneGigFeedRevisions(map(3), ['g1'], -5)), ['g1'])
})

test('the memory is ordered by DEPARTURE, not by first sight: a long-lived row that leaves last is the last to go', () => {
  // The case the guard exists for, and the one the first cut got wrong. A row
  // seen at seed time stays current for an hour while `memory` others come and
  // go; when it finally departs it is the MOST RECENT departure — a late frame
  // for it lands within seconds — yet insertion order put it at the front of
  // the map, so it was the FIRST forgotten and its stale frame replayed as new.
  let revisions: Readonly<Record<string, string>> = { longLived: '5' }
  for (let i = 0; i < 3; i += 1) {
    revisions = pruneGigFeedRevisions({ ...revisions, [`d${i}`]: '1' }, ['longLived', `d${i}`], 3)
    revisions = pruneGigFeedRevisions(revisions, ['longLived'], 3)
  }
  // Three departed behind it, all remembered; now the long-lived row leaves.
  const after = pruneGigFeedRevisions(revisions, [], 3)
  assert.equal(after.longLived, '5', 'the row that departed just now must still be guarded')
  assert.equal('d0' in after, false, 'the EARLIEST departure is the one forgotten')
  assert.deepEqual(Object.keys(after), ['d1', 'd2', 'longLived'])
})

test('a row that rejoins and departs again counts from its latest departure', () => {
  let revisions: Readonly<Record<string, string>> = { a: '1', b: '1', c: '1' }
  revisions = pruneGigFeedRevisions(revisions, ['b', 'c'], 2) // a departs first
  revisions = pruneGigFeedRevisions(revisions, ['c'], 2) // then b
  revisions = pruneGigFeedRevisions(revisions, ['a', 'c'], 2) // a is back
  revisions = pruneGigFeedRevisions(revisions, ['c'], 2) // a departs again — now the newest departure
  const after = pruneGigFeedRevisions({ ...revisions, d: '1' }, ['c'], 2) // d, never current, departs last
  assert.deepEqual(Object.keys(after), ['a', 'd', 'c'], 'b (the oldest departure) goes; a and d stay')
})
