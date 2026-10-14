/**
 * Honour the API's rate limit instead of racing it.
 *
 * `/v1/agent/tasks` is capped at 10 requests per minute per IP, and posting one
 * gig costs TWO calls to it — the 402 quote and the paid 201 — so the route
 * admits roughly FIVE gigs a minute. A book of twenty posted back to back does
 * not fail because anything is wrong; it fails because the limit is doing its
 * job. The limit is deliberate (the route does live RPC reads, and the paid leg
 * broadcasts a transaction the hot wallet funds), so the seeder waits for it
 * rather than trying to slip past it.
 *
 * WAITING IS NOT OPTIONAL HERE. Every successful post is funded and
 * irreversible, so a 429 in the middle of a run must not be allowed to become
 * ten skipped gigs the operator then has to reconcile by hand against the
 * chain. Backing off turns a partial run into a slow one, which is the trade
 * worth making.
 */

/** The one status this module retries. Anything else is the caller's problem. */
export const RATE_LIMITED = 429

/**
 * The route's own `timeWindow`, used only when the server declines to say when
 * to come back. A full window is the shortest wait that is certain to clear a
 * fixed-window limiter no matter where in the window the rejection landed.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * A margin on top of the server's figure. `retry-after` is whole seconds, so it
 * is rounded DOWN relative to the true reset, and returning at exactly the
 * stated moment can land one tick early and burn another request against the
 * bucket it is waiting for.
 */
export const RETRY_GRACE_MS = 1_000

/** `Rate limit exceeded, retry in 43 seconds` — the message this API sends. */
const MESSAGE_HINT = /retry in (\d+) seconds?/i

export interface RateLimitedResponse {
  status: number
  json: Record<string, unknown>
  headers: Headers
}

/**
 * How long to wait, in milliseconds, from whatever the server was willing to
 * say. The header is authoritative; the message is the documented fallback
 * because this deployment demonstrably sends the figure there too, and a seeder
 * that guessed a full window on every 429 would take twenty minutes to do five
 * minutes of work.
 */
export function retryAfterMs(res: RateLimitedResponse): number {
  const header = res.headers.get('retry-after')
  const fromHeader = header === null ? Number.NaN : Number(header)
  if (Number.isFinite(fromHeader) && fromHeader >= 0) {
    return fromHeader * 1_000 + RETRY_GRACE_MS
  }
  const message = typeof res.json['message'] === 'string' ? res.json['message'] : ''
  const matched = MESSAGE_HINT.exec(message)
  if (matched !== null) return Number(matched[1]) * 1_000 + RETRY_GRACE_MS
  return RATE_LIMIT_WINDOW_MS
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts: number
  /** Where the wait is announced — the operator is watching a long run. */
  onWait(waitMs: number, attempt: number): void
  /** Injectable so tests do not actually sleep. */
  wait?: (ms: number) => Promise<void>
}

/**
 * Run `call`, waiting out any 429 and trying again.
 *
 * Returns the LAST response rather than throwing when the attempts run out:
 * the caller already knows how to report a bad status, and a run that exhausts
 * its retries should surface the server's own words, not this module's.
 */
export async function withRateLimitRetry(
  call: () => Promise<RateLimitedResponse>,
  opts: RetryOptions,
): Promise<RateLimitedResponse> {
  const wait = opts.wait ?? sleep
  let res = await call()
  for (let attempt = 1; attempt < opts.attempts && res.status === RATE_LIMITED; attempt += 1) {
    const waitMs = retryAfterMs(res)
    opts.onWait(waitMs, attempt)
    await wait(waitMs)
    res = await call()
  }
  return res
}
