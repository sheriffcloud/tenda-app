export * from './gig-utils'
export { computePlatformFee, computePlatformFeeRaw } from './fees'
export { isCrossBorder } from './cross-border'
export { LAMPORTS_PER_SOL } from './constants'
export { parseUnits, formatUnits } from './units'
export { truncateWallet } from './wallet'
export {
  partyRoleLabel,
  winnerLabel,
  displayName,
  formatFullName,
  hasCompleteName,
  resolveDisputeSender,
  disputeViewerSeat,
  type PartyRole,
  type DisputeSender,
  type DisputeSenderArgs,
} from './parties'
export { normalizeChainAddress, sameChainAddress, chainNamespaceOf } from './address'

export {
  MIN_PAYMENT_LAMPORTS,
  MAX_PAYMENT_LAMPORTS,
  MAX_GIG_TITLE_LENGTH,
  MAX_GIG_DESCRIPTION_LENGTH,
  MAX_DISPUTE_REASON_LENGTH,
  MIN_COMPLETION_DURATION_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MAX_PAGINATION_LIMIT,
  MAX_REVIEW_COMMENT_LENGTH,
  isValidPaymentLamports,
  gigAmountBounds,
  isValidGigAmountRaw,
  isValidCompletionDuration,
  isValidWalletAddress,
  isValidReviewScore,
  isCloudinaryUrl,
  isValidLatitude,
  isValidLongitude,
  validateGigDeadlines,
  E164_RE,
  isE164,
  EMAIL_MAX_LENGTH,
  EMAIL_SHAPE,
  normalizeEmail,
} from './validation'
export type { ValidationResult } from './validation'
export { buildAuthMessage, type AuthMessageInput } from './auth-message'
export {
  resolveSolanaTransactionStatus,
  type SolanaSignatureStatusValue,
} from './solana-transaction-status'
export { resolveHttpRpcEndpoints, type HttpRpcEndpointOptions } from './rpc-endpoints'
export { withTimeout } from './async'
export { isAmountRaw } from './amount-raw'
