export interface EscrowCreationAttempt {
  operationId: string
  termsFingerprint: string
}

/**
 * Reuse the exact request identity after an ambiguous response, not after terms
 * change.
 *
 * This used to freeze an `acceptDeadlineUnix` beside the operation id, because
 * the body carried an absolute instant and a retry had to resend the SAME one.
 * #41 moved the wire to a duration, and a duration is already one of the terms
 * the fingerprint is taken over — so there is no separate instant left to pin,
 * and the server derives the deadline when it builds the transaction.
 */
export function reuseOrCreateEscrowCreationAttempt(
  current: EscrowCreationAttempt | null,
  terms: readonly (string | number | boolean | null)[],
  createOperationId: () => string,
): EscrowCreationAttempt {
  const termsFingerprint = JSON.stringify(terms)
  if (current?.termsFingerprint === termsFingerprint) return current
  return { operationId: createOperationId(), termsFingerprint }
}
