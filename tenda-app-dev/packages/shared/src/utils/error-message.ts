/**
 * The words a thrown value carries, if it carries any.
 *
 * Both clients had `(e as Error).message || 'Something failed'` inline across
 * their catch handlers. The cast is the problem: `throw null` is legal and a
 * rejected promise can carry anything, so reading `.message` off it throws
 * INSIDE the failure handler — the user gets a red box where a toast belonged,
 * and the original failure is lost with it. Proven, not theorised: mocking a
 * transition to reject with `null` produced
 * `TypeError: Cannot read properties of null (reading 'message')`.
 *
 * Returns '' rather than a fallback so each caller keeps its own — the copy
 * for a failed draft delete is not the copy for a failed transaction, and a
 * fallback baked in here would flatten them (`pageLoadErrorMessage` bakes one
 * in on purpose: there is exactly one list-load line).
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : ''
}
