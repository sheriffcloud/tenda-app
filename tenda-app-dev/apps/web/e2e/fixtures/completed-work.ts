/**
 * GET /v1/users/:id/completed-work — the categories a user has delivered in.
 *
 * Its own module for the same reason reviews, chat, disputes, exchange and
 * fiat have one: authed-routes.ts is the dispatcher, not the place fixtures
 * accumulate.
 *
 * PUBLIC on the real server (rolled-up signals only, exactly like
 * /v1/users/:id/standing), so this answers without a bearer too — a stub that
 * demanded one would let the page pass here while 401ing in production.
 */
import { json, type StubResponse } from './reply'

/**
 * EVERY category, with distinct descending counts. Two reasons, both measured:
 * unequal counts mean the surface has to prove the ORDER it renders rather
 * than getting it right by accident, and the full set is the only fixture wide
 * enough that a non-wrapping chip row would actually overflow a 320px screen —
 * with three short chips the layout assertion held even after `flex-wrap` was
 * removed, i.e. it proved nothing.
 */
const COMPLETED_WORK = [
  { category: 'delivery', count: 12 },
  { category: 'photo', count: 5 },
  { category: 'service', count: 4 },
  { category: 'errand', count: 2 },
  { category: 'digital', count: 1 },
]

/** `null` when this is not a completed-work URL, like every sibling handler. */
export function handleCompletedWork(url: URL, method: string): StubResponse | null {
  if (url.pathname.match(/^\/v1\/users\/[^/]+\/completed-work$/) === null || method !== 'GET') {
    return null
  }
  return json({ data: COMPLETED_WORK })
}
