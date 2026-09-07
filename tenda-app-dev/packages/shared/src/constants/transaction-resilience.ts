/** Shared transaction timing policy. Values are named so transports and UI cannot drift. */
export const TRANSACTION_RESILIENCE = {
  rpcAttemptTimeoutMs: 12_000,
  broadcastAttemptsPerEndpoint: 2,
  broadcastRetryBaseMs: 500,
  slowOperationNoticeMs: 5_000,
  confirmationPollMs: 2_000,
  projectionPollMs: 1_000,
  confirmationTimeoutMs: 60_000,
  confirmedDismissMs: 800,
} as const
