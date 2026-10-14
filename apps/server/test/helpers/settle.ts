/**
 * Bound a promise in a TEST, so a hang is a FAILURE and not a hung runner.
 *
 * The suites that need this are the ones asserting a timeout works: they hand
 * the code an endpoint that never answers, and if the timeout under test
 * regresses, awaiting the call directly turns a RED test into a gate that never
 * returns — with the failure that tripped it never reported. This repo has paid
 * that once (#48: a stub-RPC suite held the runner for 2m25s), which is why the
 * bound belongs in the test rather than only in the code it checks.
 *
 * A THIN WRAPPER OVER `withTimeout`, never its own `Promise.race`, and the
 * distinction is the whole reason this file is three lines instead of twelve.
 * It was a second hand-rolled race — same timer, same `finally` clear, same
 * semantics — which is precisely what chains/rpc/call.ts warns against one
 * import away: "`withTimeout` (shared) is the one race in this codebase; a
 * second hand-rolled Promise.race is how two timeout semantics appear." A test
 * helper is not exempt from that; it is the copy nobody re-reads.
 *
 * Delegating also inherits the guard the copy had dropped: `withTimeout`
 * rejects a non-finite or non-positive budget with a RangeError, where a
 * hand-rolled `setTimeout(fn, NaN)` fires immediately and reports a mistyped
 * budget as "still pending after NaNms" — a false failure naming the wrong
 * thing.
 *
 * All this file still owns is the MESSAGE shape, which is why it survives as a
 * wrapper at all: callers pass what they were waiting for, not a full sentence.
 */
import { withTimeout } from '@tenda/shared'

export function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return withTimeout(promise, ms, `${what}: still pending after ${ms}ms`)
}
