/**
 * "The server refused this because the listing was pulled."
 *
 * Distinct from lib/detail-load-error's `gone`, which is about a READ that came
 * back empty. This is about a WRITE the server declined while the screen still
 * believes the action is available — the stale-client case the takedown gate
 * exists to catch (server: lib/escrow/takedown.ts).
 *
 * Its own predicate rather than an `instanceof` in each caller, for the reason
 * dispute-send-error.ts and detail-load-error.ts are: classification lives
 * beside the code it compares, once. Two callers already need it — a transition
 * (useEscrowActions) and an application (useApprovalFlow) — and they must agree,
 * because the response to it is the same in both: re-read the screen, so the
 * button the user just pressed stops being offered.
 */
import { ErrorCode } from '@tenda/shared'
// Through the barrel, like detail-load-error.ts: a test that stubs
// `@/api/client` must see this predicate compare against the SAME class it
// throws, or the instanceof silently answers false and the branch never runs.
import { ApiClientError } from '@/api/client'

/**
 * Matched on the CODE, never the 409 status: the same status carries
 * ESCROW_WRONG_STATUS (a genuine state-machine conflict, where re-reading is
 * also right but the meaning is different) and other conflicts where it is not.
 * The code is the part the server promises.
 */
export function isTakedownRefusal(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === ErrorCode.ESCROW_TAKEN_DOWN
}
