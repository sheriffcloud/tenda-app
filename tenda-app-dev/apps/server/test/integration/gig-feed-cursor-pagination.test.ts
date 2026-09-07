import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TEST_DB_CONFIGURED,
  createEscrow,
  createUser,
  attachGigDetails,
  authHeader,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function createOpenGigAt(createdAt: Date, title: string): Promise<string> {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    created_at: createdAt,
  })
  await attachGigDetails(app, escrow.id, { title })
  return escrow.id
}

test('cursor pagination neither duplicates nor skips after a newer insertion', { skip }, async () => {
  const app = getApp()
  const oldest = await createOpenGigAt(new Date('2026-01-01T00:00:00Z'), 'Oldest')
  const middle = await createOpenGigAt(new Date('2026-01-02T00:00:00Z'), 'Middle')
  const newest = await createOpenGigAt(new Date('2026-01-03T00:00:00Z'), 'Newest')

  const first = await app.inject({ method: 'GET', url: '/v1/gigs?limit=2' })
  assert.strictEqual(first.statusCode, 200)
  assert.deepStrictEqual(first.json().data.map((gig: { escrow_id: string }) => gig.escrow_id), [
    newest,
    middle,
  ])
  assert.strictEqual(typeof first.json().next_cursor, 'string')

  const inserted = await createOpenGigAt(new Date('2026-01-04T00:00:00Z'), 'Inserted later')
  const second = await app.inject({
    method: 'GET',
    url: `/v1/gigs?limit=2&cursor=${encodeURIComponent(first.json().next_cursor)}`,
  })
  assert.strictEqual(second.statusCode, 200)
  assert.strictEqual(second.json().total, 4)
  assert.deepStrictEqual(second.json().data.map((gig: { escrow_id: string }) => gig.escrow_id), [oldest])
  assert.ok(!second.json().data.some((gig: { escrow_id: string }) => gig.escrow_id === inserted))
  assert.strictEqual(second.json().next_cursor, null)
})

test('search omits cursor metadata and malformed cursor is rejected', { skip }, async () => {
  const app = getApp()
  await createOpenGigAt(new Date('2026-01-01T00:00:00Z'), 'Unique searchable title')

  const search = await app.inject({ method: 'GET', url: '/v1/gigs?q=searchable' })
  assert.strictEqual(search.statusCode, 200)
  assert.ok(!Object.hasOwn(search.json(), 'next_cursor'))

  const malformed = await app.inject({ method: 'GET', url: '/v1/gigs?cursor=not-a-cursor' })
  assert.strictEqual(malformed.statusCode, 400)
  assert.strictEqual(malformed.json().code, 'VALIDATION_ERROR')
})

test('ordinary filter validation keeps precedence over malformed cursor', { skip }, async () => {
  const app = getApp()
  const response = await app.inject({
    method: 'GET',
    url: '/v1/gigs?category=not-a-category&cursor=not-a-cursor',
  })
  assert.strictEqual(response.statusCode, 400)
  assert.match(response.json().message, /category/i)
})

test('cursor is refused for private, search, and explicit-sort queries', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const cases = [
    { url: '/v1/gigs?mine=created&cursor=value', headers: authHeader(creator.token) },
    { url: '/v1/gigs?q=term&cursor=value' },
    { url: '/v1/gigs?sort=amount_asc&cursor=value' },
  ]
  for (const request of cases) {
    const response = await app.inject({ method: 'GET', ...request })
    assert.strictEqual(response.statusCode, 400)
    assert.strictEqual(response.json().code, 'VALIDATION_ERROR')
  }
})

test('explicit recency sorting uses the same escrow-id tie-breaker as realtime', { skip }, async () => {
  const createdAt = new Date('2026-02-01T00:00:00Z')
  const ids = [
    await createOpenGigAt(createdAt, 'Same time A'),
    await createOpenGigAt(createdAt, 'Same time B'),
  ]
  const response = await getApp().inject({ method: 'GET', url: '/v1/gigs?sort=created_at' })
  assert.strictEqual(response.statusCode, 200)
  const returnedIds = response.json().data
    .map((gig: { escrow_id: string }) => gig.escrow_id)
    .filter((id: string) => ids.includes(id))
  assert.deepStrictEqual(returnedIds, [...ids].sort().reverse())
})
