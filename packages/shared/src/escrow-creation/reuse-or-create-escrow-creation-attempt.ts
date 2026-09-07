export interface EscrowCreationAttempt {
  operationId: string
  termsFingerprint: string
  acceptDeadlineUnix: number
}

/** Reuse the exact request identity after an ambiguous response, not after terms change. */
export function reuseOrCreateEscrowCreationAttempt(
  current: EscrowCreationAttempt | null,
  terms: readonly (string | number | boolean | null)[],
  createAcceptDeadlineUnix: () => number,
  createOperationId: () => string,
): EscrowCreationAttempt {
  const termsFingerprint = JSON.stringify(terms)
  if (current?.termsFingerprint === termsFingerprint) return current
  return {
    operationId: createOperationId(),
    termsFingerprint,
    acceptDeadlineUnix: createAcceptDeadlineUnix(),
  }
}
