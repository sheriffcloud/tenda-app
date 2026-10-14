/**
 * The words a TRANSACTION failure carries, including the ones `errorMessage`
 * deliberately refuses.
 *
 * `errorMessage` answers '' for anything that is not an `Error`, and that is
 * correct for the general case it guards — a deserialised wire envelope must
 * never reach a toast (its own suite pins that). But a browser wallet does not
 * reject with an `Error`: EIP-1193 providers reject with a PLAIN JSON-RPC
 * object, so every wallet-side reason — "insufficient funds for gas", "user
 * rejected the request" — was dropped and the caller's generic fallback
 * ("Transaction failed, please try again") was shown instead. Measured, both
 * shapes, before this existed. `isUserRejection` next door already reads
 * `.code` off that same plain object for exactly this reason.
 *
 * The discriminator is a NUMERIC `code`. JSON-RPC error codes are numbers
 * (4001, -32000, -32603); our own ApiError envelope's `code` is a string
 * `ErrorCode`. So a wire payload can never be mistaken for a provider error
 * and the guarantee `errorMessage`'s tests pin still holds.
 */
import { errorMessage } from '../utils/error-message'

/**
 * How many `data` wrappers to unwrap. A provider that wraps another provider's
 * error nests one, maybe two, levels; the cap exists because a cyclic object
 * (`err.data === err`) would otherwise recurse forever — and a crash inside a
 * failure handler is the precise class of bug `errorMessage` was written to
 * prevent, so this must not reintroduce it.
 */
const MAX_WRAP_DEPTH = 4

/** Narrowing without a cast — the value's own keys stay `unknown`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The innermost provider message, or ''.
 *
 * `data` is read BEFORE the object's own `message` because a wrapping provider
 * keeps the useful sentence in there and puts a generic one outside — MetaMask
 * reports "Internal JSON-RPC error." with the node's actual reason nested in
 * `data` (EIP-1474). Taking the outer message first would show the wrapper and
 * throw away the answer.
 */
function providerMessageAt(error: unknown, depth: number): string {
  if (depth > MAX_WRAP_DEPTH || !isRecord(error)) return ''
  if (typeof error.code !== 'number') return ''
  const nested = providerMessageAt(error.data, depth + 1)
  if (nested !== '') return nested
  return typeof error.message === 'string' ? error.message : ''
}

/**
 * What to TELL the user a transaction failed for, or '' when the value carries
 * nothing — callers keep their own fallback, exactly as with `errorMessage`.
 *
 * Provider-first, and the order is load-bearing: a wrapped provider failure can
 * ALSO be an `Error` whose own `.message` is the generic wrapper line, so the
 * read that digs into `data` has to win over the plain `.message`.
 */
export function transactionFailureMessage(error: unknown): string {
  return providerMessageAt(error, 0) || errorMessage(error)
}
