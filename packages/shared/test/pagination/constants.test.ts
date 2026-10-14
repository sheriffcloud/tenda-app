/**
 * The inbox page size is a contract between two ends: the server answers with
 * it by default and the client sends it explicitly, so that a FULL page means
 * "there may be more". If the two ever disagreed the client would read a short
 * page as the end, or a full one as a reason to ask again forever.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INBOX_PAGE_SIZE, PAGE_SIZE } from '../../src/pagination/constants'
import { MAX_PAGINATION_LIMIT } from '../../src/utils/validation'

test('the inbox page never exceeds what the server will actually return', () => {
  assert.ok(INBOX_PAGE_SIZE <= MAX_PAGINATION_LIMIT)
})

test('the inbox page is at least the standard page: its first load must hold more than a feed\'s', () => {
  assert.ok(INBOX_PAGE_SIZE >= PAGE_SIZE)
})

test('the inbox page is 50, what the list returned before it could page', () => {
  // Pinned because the Messages tab groups Unread/Earlier over what is loaded;
  // shrinking this would push unread threads off the first screen.
  assert.equal(INBOX_PAGE_SIZE, 50)
})
