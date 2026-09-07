/**
 * query-cache — bounded page-0 memo; eviction must be LRU, not FIFO (ported
 * from mobile at the move).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQueryCache, QUERY_CACHE_LIMIT, readPage, rememberPage } from '../../src/pagination'

interface Row {
  id: string
}
const entry = (id: string, total = 1) => ({ items: [{ id }], total })

test('reads back what was remembered, including the server total', () => {
  const cache = createQueryCache<Row>()
  rememberPage(cache, 'chain=celo', entry('a', 57))
  assert.deepEqual(readPage(cache, 'chain=celo'), { items: [{ id: 'a' }], total: 57 })
})

test('misses on a query never remembered', () => {
  assert.equal(readPage(createQueryCache<Row>(), 'chain=base'), undefined)
})

test('overwrites a re-remembered key rather than duplicating it', () => {
  const cache = createQueryCache<Row>()
  rememberPage(cache, 'k', entry('old'))
  rememberPage(cache, 'k', entry('fresh'))
  assert.equal(cache.size, 1)
  assert.deepEqual(readPage(cache, 'k')?.items, [{ id: 'fresh' }])
})

test('stays bounded, evicting the least recently used entry', () => {
  const cache = createQueryCache<Row>()
  for (let i = 0; i <= QUERY_CACHE_LIMIT; i++) rememberPage(cache, `k${i}`, entry(`r${i}`))
  assert.equal(cache.size, QUERY_CACHE_LIMIT)
  assert.equal(readPage(cache, 'k0'), undefined)
  assert.notEqual(readPage(cache, `k${QUERY_CACHE_LIMIT}`), undefined)
})

test('a READ counts as a use, so the entry survives the next eviction', () => {
  const cache = createQueryCache<Row>()
  for (let i = 0; i < QUERY_CACHE_LIMIT; i++) rememberPage(cache, `k${i}`, entry(`r${i}`))
  assert.notEqual(readPage(cache, 'k0'), undefined)

  rememberPage(cache, 'newest', entry('new'))
  assert.notEqual(readPage(cache, 'k0'), undefined)
  assert.equal(readPage(cache, 'k1'), undefined)
})
