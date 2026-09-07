/**
 * AppError, the HTTP envelope every route throws, and the small guards that
 * throw it most often.
 *
 * WHICH STATUS GOES WITH ErrorCode.VALIDATION_ERROR
 *
 * One code, three statuses, and until #60 no rule written anywhere — which is
 * how #52 came to justify a choice with "422 is the house convention" when the
 * majority was 400. For NEW code:
 *
 *   400  the request could not be interpreted — a field is missing, or present
 *        with the wrong type, or a query parameter will not parse. Both guards
 *        below throw it, as do the latitude/longitude range checks in
 *        lib/validation.ts.
 *   422  the request was understood and is refused on its CONTENT — a value
 *        that parses fine but is not acceptable for this operation.
 *   409  refused because of state that already exists — an expired quote, a
 *        bank account already saved.
 *
 * WHERE THE LINE IS GENUINELY BLURRED, because pretending otherwise is how the
 * last claim about a convention went wrong: `optionalString` in
 * lib/validation.ts throws 422 for a value that is EITHER the wrong type (400
 * by the rule) OR too long (422 by the rule). One check, two categories. When
 * a guard straddles them, pick the status for the case a caller is likelier to
 * hit and say so where you throw.
 *
 * LOCAL CONSISTENCY BEATS THIS RULE. If the endpoint you are editing already
 * answers one status for this class of error, match it. One endpoint returning
 * two different statuses for the same kind of failure is worse for a client
 * than one endpoint disagreeing with the rule (the reasoning #52 recorded for
 * validateCreateEscrow, which is 422 throughout).
 *
 * WHAT IS ACTUALLY OUT THERE, counted across src/ on 2026-08-20 (#60):
 * 84 x 400, 45 x 422, 6 x 409. The existing sites are NOT uniformly aligned
 * with the rule above — several 422s are missing-field or malformed-value
 * checks that the rule would put at 400.
 *
 * NOTHING WAS MOVED, and here is the evidence rather than the assumption. 14
 * places in the two clients and shared branch on `ApiClientError.statusCode`,
 * and not one of them would behave differently if a VALIDATION_ERROR changed
 * between these three codes: three test for 404 and five for 401/403, which
 * are other classes entirely; two test `statusCode < 500`, which all three
 * satisfy; three test 409 but only alongside ErrorCode.DUPLICATE_SIGNATURE;
 * one tests `!== 401 && !== 403`. Everything else in both clients discriminates
 * on `code`. So a migration would rewrite 45 assertions across 20 server test
 * files and be invisible to every caller — read the rule as guidance for the
 * next route, not as a description of the last hundred and thirty-five.
 */
import http from 'node:http'
import { ErrorCode } from '@tenda/shared'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode | string,
    message: string,
    /**
     * Optional machine-readable payload serialized alongside the error
     * (e.g. WALLET_IN_USE returns the blocking escrow_ids). Keep it small
     * and JSON-safe, it goes straight to the client.
     */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AppError'
  }

  /** Human-readable HTTP status label derived from status code, e.g. "Not Found" for 404. */
  get errorLabel(): string {
    return http.STATUS_CODES[this.statusCode] ?? 'Error'
  }
}

/**
 * Guard a request body before destructuring it. Fastify types `request.body`
 * as the declared Body shape, but at runtime it is `null` for a body-less
 * POST/PATCH, destructuring that throws a TypeError → 500. This narrows it
 * to a real object and returns a clean 400 instead (only null/undefined crash
 * a destructure; a non-object body yields `undefined` fields the route's own
 * validation already rejects).
 */
export function requireBody<T>(body: T): NonNullable<T> {
  if (body === null || body === undefined) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'request body is required')
  }
  return body
}

/**
 * Validate that a field is a non-empty string and return it (400 otherwise).
 * Single home for the check the auth routes all need, replaces the per-route
 * `requireString` copies.
 *
 * The 400 is the rule at the top of this file: a missing or wrongly-typed
 * field is a request the server cannot interpret. This docstring said 422
 * until #60 while the code said 400 — the number is pinned by
 * test/unit/errors-guards.test.ts now, so the two cannot drift apart again in
 * silence.
 */
export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `${field} is required and must be a non-empty string`)
  }
  return value
}
