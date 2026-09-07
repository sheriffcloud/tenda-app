/**
 * #91 — cursor mechanics for the inclusive-gte thread contract.
 */
import { test } from 'vitest'
import assert from 'node:assert'
import type { DisputeMessage } from '@tenda/shared'
import { mergeMessages, nextCursor } from '../lib/dispute-thread'

function msg(id: string, created_at: string): DisputeMessage {
  return {
    id,
    dispute_id: 'd1',
    sender_id: 'u1',
    body: id,
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    created_at,
  }
}

const T1 = '2026-06-05T10:00:00.000Z'
const T2 = '2026-06-05T10:00:00.500Z'
const T3 = '2026-06-05T10:00:01.000Z'

test('merge dedupes the inclusive-boundary echo by id', () => {
  const existing = [msg('a', T1), msg('b', T2)]
  // Inclusive gte cursor re-delivers 'b' alongside the new 'c'.
  const merged = mergeMessages(existing, [msg('b', T2), msg('c', T3)])
  assert.deepStrictEqual(merged.map((m) => m.id), ['a', 'b', 'c'])
})

test('merge orders same-millisecond siblings deterministically (by id)', () => {
  const merged = mergeMessages([msg('z', T2)], [msg('a', T2), msg('m', T1)])
  assert.deepStrictEqual(merged.map((m) => m.id), ['m', 'a', 'z'])
})

test('merge keeps interleaved counterparty messages that arrive late', () => {
  // Local view already holds T3; a poll then delivers an interleaved T2.
  const merged = mergeMessages([msg('mine', T3)], [msg('theirs', T2), msg('mine', T3)])
  assert.deepStrictEqual(merged.map((m) => m.id), ['theirs', 'mine'])
})

test('cursor advances only from batches; empty batch leaves it unchanged', () => {
  assert.strictEqual(nextCursor(null, [msg('a', T1), msg('b', T3), msg('c', T2)]), T3)
  assert.strictEqual(nextCursor(T3, []), T3)
  // A batch of only-older messages (boundary echo) never rewinds it.
  assert.strictEqual(nextCursor(T3, [msg('a', T1)]), T3)
})
