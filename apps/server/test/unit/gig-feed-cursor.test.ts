import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  decodeGigFeedCursor,
  encodeGigFeedCursor,
  GIG_FEED_CURSOR_MAX_LENGTH,
} from '@server/routes/v1/gigs/gig-feed-cursor'

test('gig feed cursor round-trips timestamp and escrow tie-breaker', () => {
  const cursor = {
    created_at: new Date('2026-08-13T10:00:00.000Z'),
    escrow_id: '00000000-0000-4000-8000-000000000001',
  }
  assert.deepEqual(decodeGigFeedCursor(encodeGigFeedCursor(cursor)), cursor)
})

test('gig feed cursor rejects malformed payloads with a controlled 400', () => {
  const malformedValues = [
    'not-json',
    Buffer.from('{}').toString('base64url'),
    Buffer.from('[]').toString('base64url'),
    Buffer.from(JSON.stringify({ created_at: 42, escrow_id: randomUUID() })).toString('base64url'),
    Buffer.from(JSON.stringify({ created_at: 'not-a-date', escrow_id: randomUUID() })).toString('base64url'),
    Buffer.from(JSON.stringify({ created_at: new Date().toISOString() })).toString('base64url'),
  ]
  for (const value of malformedValues) {
    assert.throws(
      () => decodeGigFeedCursor(value),
      (error: Error & { statusCode?: number }) => error.statusCode === 400,
    )
  }
  const invalidId = Buffer.from(JSON.stringify({
    created_at: '2026-08-13T10:00:00.000Z',
    escrow_id: 'not-a-uuid',
  })).toString('base64url')
  assert.throws(() => decodeGigFeedCursor(invalidId), /cursor is invalid/)
})

test('gig feed cursor rejects noncanonical aliases and oversized input', () => {
  const canonical = encodeGigFeedCursor({
    created_at: new Date('2026-08-13T10:00:00.000Z'),
    escrow_id: '00000000-0000-4000-8000-000000000001',
  })
  assert.throws(() => decodeGigFeedCursor(`${canonical}=`), /cursor is invalid/)
  assert.throws(() => decodeGigFeedCursor(`${canonical}!`), /cursor is invalid/)
  assert.throws(() => decodeGigFeedCursor('a'.repeat(GIG_FEED_CURSOR_MAX_LENGTH + 1)), /cursor is invalid/)

  const nonCanonicalDate = Buffer.from(JSON.stringify({
    created_at: '2026-08-13T10:00:00Z',
    escrow_id: '00000000-0000-4000-8000-000000000001',
  })).toString('base64url')
  assert.throws(() => decodeGigFeedCursor(nonCanonicalDate), /cursor is invalid/)
})
