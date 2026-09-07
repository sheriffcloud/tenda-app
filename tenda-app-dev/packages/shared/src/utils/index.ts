export * from './gig-utils'
export {
  DURATION_UNIT_SECONDS,
  DURATION_PRESETS,
  customDurationToSeconds,
  durationRangeLabel,
  completionDurationProblem,
  type DurationUnit,
} from './gig-duration'
export {
  computePlatformFee,
  computePlatformFeeRaw,
  escrowFeeBreakdown,
  type EscrowFeeBreakdown,
} from './fees'
export { isCrossBorder } from './cross-border'
export { LAMPORTS_PER_SOL } from './constants'
export { parseUnits, formatUnits, sanitizeDecimalText } from './units'
export {
  hasGigBudget,
  gigBudgetFromUnits,
  gigBudgetRangeLabel,
  gigBudgetToRaw,
  gigBudgetToText,
  sanitizeGigBudgetText,
  FIAT_ENTRY_DECIMALS,
} from './gig-budget'
export { truncateWallet } from './wallet'
export {
  partyRoleLabel,
  winnerLabel,
  partyAccent,
  displayName,
  formatFullName,
  hasCompleteName,
  resolveDisputeSender,
  disputeViewerSeat,
  formatReviewScore,
  type PartyRole,
  type PartyAccent,
  type DisputeSender,
  type DisputeSenderArgs,
} from './parties'
export { normalizeChainAddress, sameChainAddress, chainNamespaceOf } from './address'

export {
  MAX_GIG_TITLE_LENGTH,
  MAX_GIG_DESCRIPTION_LENGTH,
  MAX_DISPUTE_REASON_LENGTH,
  MIN_COMPLETION_DURATION_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MAX_PAGINATION_LIMIT,
  MAX_PROXIMITY_RADIUS_KM,
  MAX_REVIEW_COMMENT_LENGTH,
  gigAmountBounds,
  isValidGigAmountRaw,
  isValidCompletionDuration,
  isValidAcceptWindow,
  MIN_ACCEPT_WINDOW_SECONDS,
  MAX_ACCEPT_WINDOW_SECONDS,
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
export { hasNulChar } from './validation'
export { haversineDistanceMeters } from './geo'
export { buildAuthMessage, type AuthMessageInput } from './auth-message'
export {
  resolveSolanaTransactionStatus,
  type SolanaSignatureStatusValue,
} from './solana-transaction-status'
export { resolveHttpRpcEndpoints, type HttpRpcEndpointOptions } from './rpc-endpoints'
export { withTimeout, createRefreshCoordinator, type RefreshCoordinator } from './async'
export { notifyListeners } from './notify-listeners'
export { AMOUNT_RAW_PATTERN, isAmountRaw } from './amount-raw'
export {
  formatRelativeDay,
  formatRelativeShort,
  formatConvoTime,
  formatRelativeDayWithTime,
  groupByDay,
} from './date'
export type { DayGroupHeader, DayGroupItem } from './date'
export {
  toAssetPaymentDisplay,
  fiatRatePerUnit,
  formatSolDisplay,
  formatPaymentWindow,
  formatFiat,
  formatFiatShort,
  formatRate,
  formatFiatPrecise,
  type AssetPaymentDisplay,
  type RateMap,
} from './currency-display'
export {
  COUNTDOWN_WARNING_MS,
  COUNTDOWN_DANGER_MS,
  formatHMS,
  countdownTone,
  formatDurationShort,
  type CountdownTone,
} from './countdown'
export { chainLabel } from './chain-label'
export { chainDisplay, type ChainDisplay } from './chain-display'
export { unreadBadgeLabel, UNREAD_BADGE_CAP } from './unread-badge'
export { instructionCopy, INTENT_STATUS_COPY, isCancellable, isTerminal } from './fiat-display'
export { withRetry, type RetryOptions } from './with-retry'
export * from './escrow'
export * from './disputes'
export { randomUuid } from './random-uuid'
export { errorMessage } from './error-message'
export {
  classifyVerifyError,
  verifyErrorMessage,
  TIER0_MESSAGE,
  type Tier0Reason,
} from './auth-flow'
export {
  URGENT_HOURS,
  STATUS_LABEL,
  STATUS_BADGE_VARIANT,
  deadlineLabel,
  gigDeadlineMeta,
  formatDate,
  formatDuration,
  formatDeadline,
  gigPlaceLabel,
  PLACE_UNKNOWN,
  type GigPlace,
  type GigDeadlineGlyph,
  type GigDeadlineTone,
  type GigDeadlineMeta,
  type GigDeadlineSource,
} from './gig-display'
export {
  EXCHANGE_STATUS_BADGE_VARIANT,
  EXCHANGE_STATUS_LABEL,
  getOfferMissingRequirement,
  type OfferValidationValues,
} from './exchange'
