import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCrossBorder } from '../../src/utils/cross-border'

test('isCrossBorder: true when local gig in a different country than the poster', () => {
  assert.equal(isCrossBorder(false, 'NG', 'GB'), true)
})

test('isCrossBorder: false when poster and gig share a country', () => {
  assert.equal(isCrossBorder(false, 'NG', 'NG'), false)
})

test('isCrossBorder: remote gigs are never cross-border', () => {
  assert.equal(isCrossBorder(true, 'NG', 'GB'), false)
})

test('isCrossBorder: null country on either side is not cross-border', () => {
  assert.equal(isCrossBorder(false, null, 'GB'), false)
  assert.equal(isCrossBorder(false, 'NG', null), false)
  assert.equal(isCrossBorder(false, null, null), false)
})
