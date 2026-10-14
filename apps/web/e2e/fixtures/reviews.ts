/**
 * GET /v1/users/:id/reviews — the reviews left ABOUT a user.
 *
 * Its own module for the same reason chat, disputes, exchange and fiat have
 * one: authed-routes.ts is the dispatcher, not the place fixtures accumulate.
 */
import { errorEnvelope, json, type StubResponse } from './reply'
import { EXISTING_USER_ID } from './auth'

/**
 * Three reviews, so the profile's rating line states a total that is NOT one.
 * An average of one review and an average of forty both render "4.8"; the
 * count is the only thing that separates them, which is why the surface shows
 * it and why this fixture has more than a single row.
 */
const REVIEWS = [
  { id: 'rev-1', escrow_id: 'esc-1', reviewer_id: 'user-trader', reviewee_id: EXISTING_USER_ID, score: 5, comment: 'Delivered early and sent photos.', created_at: '2026-08-01T09:00:00Z' },
  { id: 'rev-2', escrow_id: 'esc-2', reviewer_id: 'user-trader', reviewee_id: EXISTING_USER_ID, score: 5, comment: 'Clear communication throughout.', created_at: '2026-08-02T09:00:00Z' },
  { id: 'rev-3', escrow_id: 'esc-3', reviewer_id: 'user-trader', reviewee_id: EXISTING_USER_ID, score: 4, comment: 'Good work, arrived a little late.', created_at: '2026-08-03T09:00:00Z' },
]

/**
 * Paginated, because the surface states the SERVER total rather than the size
 * of the page it happened to load — `null` when this is not a reviews URL.
 */
export function handleReviews(url: URL, method: string, authorized: boolean): StubResponse | null {
  if (url.pathname.match(/^\/v1\/users\/[^/]+\/reviews$/) === null || method !== 'GET') return null
  if (!authorized) {
    return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
  }
  const limit = Number(url.searchParams.get('limit') ?? 20)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  return json({ data: REVIEWS.slice(offset, offset + limit), total: REVIEWS.length, limit, offset })
}
