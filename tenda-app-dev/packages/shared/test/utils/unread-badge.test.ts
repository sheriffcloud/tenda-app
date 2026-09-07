import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UNREAD_BADGE_CAP, unreadBadgeLabel } from '../../src/utils/unread-badge'

test('renders nothing when there is nothing unread', () => {
  assert.equal(unreadBadgeLabel(0), null)
})

test('renders nothing for a negative count', () => {
  assert.equal(unreadBadgeLabel(-3), null)
})

test('shows counts up to the cap exactly', () => {
  for (const count of [1, 5, UNREAD_BADGE_CAP]) {
    assert.equal(unreadBadgeLabel(count), String(count))
  }
})

test('caps anything above the limit', () => {
  assert.equal(unreadBadgeLabel(UNREAD_BADGE_CAP + 1), `${UNREAD_BADGE_CAP}+`)
  assert.equal(unreadBadgeLabel(9999), `${UNREAD_BADGE_CAP}+`)
})

test('honours a caller-supplied cap', () => {
  assert.equal(unreadBadgeLabel(50, 99), '50')
  assert.equal(unreadBadgeLabel(150, 99), '99+')
})

test('refuses non-finite counts rather than printing NaN', () => {
  assert.equal(unreadBadgeLabel(Number.NaN), null)
  assert.equal(unreadBadgeLabel(Number.POSITIVE_INFINITY), null)
})

test('is re-exported from the package root', () => {
  // The web rail imports it from '@tenda/shared', not the deep path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const shared = require('../../src/index') as { unreadBadgeLabel: typeof unreadBadgeLabel }
  assert.equal(typeof shared.unreadBadgeLabel, 'function')
})
