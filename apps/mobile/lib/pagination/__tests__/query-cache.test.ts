/**
 * query-cache — the bounded page-0 memo behind `usePaginatedList`'s
 * `cacheQueries`. What matters here is that it stays bounded and that eviction
 * is LRU: a FIFO would drop the very filter the user is toggling against.
 */
import {
  createQueryCache,
  rememberPage,
  readPage,
  QUERY_CACHE_LIMIT,
} from '@/lib/pagination'

interface Row { id: string }
const entry = (id: string, total = 1) => ({ items: [{ id }], total })

test('reads back what was remembered, including the server total', () => {
  const cache = createQueryCache<Row>()
  rememberPage(cache, 'chain=celo', entry('a', 57))
  expect(readPage(cache, 'chain=celo')).toEqual({ items: [{ id: 'a' }], total: 57 })
})

test('misses on a query never remembered', () => {
  expect(readPage(createQueryCache<Row>(), 'chain=base')).toBeUndefined()
})

test('overwrites a re-remembered key rather than duplicating it', () => {
  const cache = createQueryCache<Row>()
  rememberPage(cache, 'k', entry('old'))
  rememberPage(cache, 'k', entry('fresh'))
  expect(cache.size).toBe(1)
  expect(readPage(cache, 'k')?.items).toEqual([{ id: 'fresh' }])
})

test('stays bounded, evicting the least recently used entry', () => {
  const cache = createQueryCache<Row>()
  for (let i = 0; i <= QUERY_CACHE_LIMIT; i++) rememberPage(cache, `k${i}`, entry(`r${i}`))
  expect(cache.size).toBe(QUERY_CACHE_LIMIT)
  expect(readPage(cache, 'k0')).toBeUndefined()
  expect(readPage(cache, `k${QUERY_CACHE_LIMIT}`)).toBeDefined()
})

test('a READ counts as a use, so the entry survives the next eviction', () => {
  // FIFO would evict k0 here even though the user just came back to it.
  const cache = createQueryCache<Row>()
  for (let i = 0; i < QUERY_CACHE_LIMIT; i++) rememberPage(cache, `k${i}`, entry(`r${i}`))
  expect(readPage(cache, 'k0')).toBeDefined()

  rememberPage(cache, 'newest', entry('new'))
  expect(readPage(cache, 'k0')).toBeDefined()
  // k1 is now the oldest use and goes instead.
  expect(readPage(cache, 'k1')).toBeUndefined()
})
