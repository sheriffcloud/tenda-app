export { ESCROW_EVENT_DEBOUNCE_MS, ESCROW_FOCUSED_POLL_MS } from './escrow-live'
export { LIST_BURST_DEBOUNCE_MS, LIST_OFFLINE_POLL_MS } from './live-lists'
export { GIG_CATEGORIES, CATEGORY_LABELS, CATEGORY_META, isGigCategory, resolveCategoryIconMap, type GigCategory, type CategoryMeta, type CategoryColorToken } from './categories'
export {
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from './currencies'
export { LOCATIONS, ALL_CITIES, findCountryForCity, isCityInCountry, isCountryCode, localeCountryOrNull, coerceCityForCountry, type CountryCode, type LocationEntry } from './locations'
export { GIG_LIST_SORTS, type GigListSort } from './gig-list'
export { MESSAGE_MAX_LENGTH } from './chat'
export { NAME_MAX_LENGTH, AGENT_BADGE_LABEL } from './users'
export { ErrorCode } from './errors'
export {
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  TENDA_RELAY_SCHEME,
  RELAY_QUOTE_TTL_SECONDS,
  RELAY_MIN_REMAINING_SECONDS,
  RELAY_PAYMENT_REQUIRED_MESSAGE,
  RELAY_PAYMENT_KINDS,
  type RelayPaymentKind,
} from './relay'
export type { ErrorCode as ErrorCodeType } from './errors'
export { SOLANA_TX_FEE_LAMPORTS, SOLANA_BLOCKHASH_VALIDITY_SECONDS, solanaChainId, solanaPublicRpcUrl, SOLANA_CAIP_BY_NETWORK, SOLANA_NATIVE_ASSET_BY_NETWORK, solanaNativeAssetId } from './solana'
export {
  EXCHANGE_DISPUTE_REASON_MIN_LENGTH,
  EXCHANGE_DISPUTE_REASON_MAX_LENGTH,
  DISPUTE_MESSAGE_MAX_LENGTH,
  EXCHANGE_PAYMENT_WINDOW_MIN_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_MAX_SECONDS,
  EXCHANGE_PAYMENT_WINDOW_OPTIONS,
  EXCHANGE_MAX_FIAT_AMOUNT,
  EXCHANGE_MAX_RATE,
  // Only the strings a CLIENT asserts against or renders are public; the CTA
  // labels are consumed by `sellWalletNotice` inside the package, and a barrel
  // entry nothing imports is surface with no reader.
  SELL_NO_WALLET_INSTANT,
  SELL_NO_WALLET_OFFER,
  SELL_WALLET_CHECKING,
  SELL_WALLET_LOAD_FAILED,
  SELL_CHAINS_UNAVAILABLE,
  P2P_PROVIDER_ID,
} from './exchange'
export {
  REPORT_CONTENT_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_REASON_LABEL,
  isBlockedByTakedown,
  TAKEDOWN_REFUSED_MESSAGE,
} from './moderation'
export type {
  ReportContentType,
  ReportReason,
  ReportStatus,
  TakedownAction,
} from './moderation'
export {
  ESCROW_TX_TYPES,
  isEscrowTxType,
  DEFAULT_ACCEPT_WINDOW_SECONDS,
  SECONDS_PER_HOUR,
  ACCEPT_DEADLINE_OPTIONS,
  AMOUNT_RAW_PRECISION,
  ESCROW_STATUS_ORDER,
  POSTED_ESCROW_STATUSES,
  ESCROW_STATUS_SETTLEMENT,
  UNSETTLED_ESCROW_STATUSES,
  ESCROW_KIND_CODE,
  DISPUTE_WINNER_CODE,
  ESCROW_LIMITS,
  type EscrowTxType,
  type EscrowStatusName,
  type EscrowKindName,
  type DisputeWinnerName,
} from './escrow'
export {
  ESCROW_TRANSITION_SYNC,
  hasAppliedEscrowTransition,
  type EscrowSyncEvidence,
  type EscrowTransitionSyncRule,
  type EscrowSyncProjection,
} from './escrow-transitions'
export {
  TX_FEED_VISIBILITY,
  ACTOR_SCOPED_FEED_TX_TYPES,
  feedTxTypesFor,
  type FeedVisibility,
} from './escrow-feed'
export {
  PROOF_TYPES,
  FILE_PROOF_TYPES,
  DATA_PROOF_TYPES,
  PROOF_TYPE_LABEL,
  MAX_PROOF_REQUIREMENTS,
  MAX_ESCROW_PROOFS,
  isProofType,
  isFileProofType,
  isDataProofType,
  normaliseProofRequirements,
  missingProofTypes,
  formatProofTypeList,
  proofIdentity,
  canonicalJson,
  type ProofType,
  type FileProofType,
  type DataProofType,
} from './proofs'
export {
  MAX_PROOF_TEXT_LENGTH,
  MAX_STRUCTURED_STRING_VALUE_LENGTH,
  parseProofPayload,
  type ProofPayload,
  type ProofPayloadParse,
  type GeotagProofPayload,
  type TextProofPayload,
  type StructuredProofPayload,
  type StructuredProofValue,
} from './proof-payloads'
export {
  PARAM_PROOF_TYPES,
  STRUCTURED_FIELD_KINDS,
  STRUCTURED_FIELD_KIND_LABEL,
  MIN_GEOTAG_RADIUS_M,
  MAX_GEOTAG_RADIUS_M,
  DEFAULT_GEOTAG_RADIUS_M,
  MAX_STRUCTURED_FIELDS,
  MAX_STRUCTURED_FIELD_NAME_LENGTH,
  parseProofParams,
  structuredValuesProblem,
  type ProofParams,
  type ProofParamsParse,
  type GeotagProofParams,
  type StructuredProofParams,
  type StructuredProofField,
  type StructuredFieldKind,
} from './proof-params'
export {
  PLATFORM_CONFIG_DEFAULTS,
  MAX_PENDING_GIGS_CEILING,
} from './platform'
export {
  APPLICATION_STATUSES,
  ACTIVE_APPLICATION_STATUSES,
  APPLICATION_ASSIGN_HOLD_SECONDS,
  APPLICATION_MESSAGE_MAX_LENGTH,
  MAX_OPEN_APPLICATIONS_CEILING,
  MIN_APPLICATION_TTL_SECONDS,
  MAX_APPLICATION_TTL_SECONDS,
  APPLICATION_UNASSIGN_TIGHT_WINDOW_SECONDS,
  isApplicationStatus,
  type ApplicationStatus,
} from './applications'
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  rolesWithPermission,
  type Permission,
} from './permissions'
export {
  DISPUTE_LIST_STATUSES,
  DISPUTE_LIST_ASSIGNED,
  type DisputeListStatus,
  type DisputeListAssigned,
} from './disputes'
export {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_TITLE_MAX,
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_SCREEN,
  type NotificationScreen,
  NOTIFICATION_RETENTION_READ_DAYS,
  NOTIFICATION_RETENTION_MAX_DAYS,
  PUSH_ANNOUNCEMENT_TTL_DAYS,
  ANNOUNCEMENT_TARGETS,
  type AnnouncementTarget,
} from './notifications'
export * from './assets'
export { TRANSACTION_RESILIENCE } from './transaction-resilience'
export { TRANSACTION_COPY } from './transaction-copy'
export {
  PROOF_COPY,
  proofRequirementLine,
  proofParamDetail,
  proofPayloadLines,
  formatCoords,
  formatMetres,
  checkInVerdict,
  type ProofPayloadLine,
} from './proof-copy'
export {
  SIGNING_WALLET_COPY,
  BOUND_WALLET_LABEL,
  BOUND_WALLET_REFUSAL,
  unlinkedWalletMessage,
} from './signing-wallet-copy'
export { APP_INFO, type AppInfo } from './app-info'
export {
  TX_PROGRESS_LABEL,
  WALLET_OPEN_NOTE,
  isGatedTxAction,
  txConfirmCopy,
  txSuccessCopy,
  type TxConfirmContext,
  type TxConfirmCopy,
} from './escrow-action-copy'
export {
  TITLE_MAX,
  DESC_MAX,
  DEFAULT_COMPLETION_SECONDS,
  CATEGORY_HINTS,
  PROOF_NOTE,
  // Only the strings a CLIENT asserts against are public. The rest of the
  // notice copy is consumed by `composerWalletNotice` inside the package, and
  // a barrel entry nothing imports is surface with no reader.
  COMPOSER_WALLET_TITLE,
  COMPOSER_WALLET_BODY,
  COMPOSER_WALLET_UNAVAILABLE_TITLE,
  GIG_COMPOSER_STEPS,
  GIG_REQUIREMENTS,
  firstMissingRequirement,
  getGigStepMissingRequirement,
  getGigMissingRequirement,
  type GigFormValues,
  type GigComposerStep,
  type GigRequirementCheck,
  type GigValidationValues,
} from './gig-composer'
export {
  emptyProofParamsDraft,
  emptyStructuredFieldDraft,
  draftFromProofParams,
  draftRadiusM,
  buildProofParams,
  composerProofSubmission,
  proofSetupProblem,
  type ProofParamsDraft,
  type StructuredFieldDraft,
} from './gig-composer-proofs'
export {
  APPLY_OBLIGATION,
  APPLY_TITLE,
  APPLY_MESSAGE_LABEL,
  APPLY_MESSAGE_PLACEHOLDER,
  APPLY_SUBMIT_LABEL,
  APPLY_WALLET_LABEL,
  APPLY_WALLET_HINT,
  APPLY_WALLET_REQUIRED,
  APPLY_WALLET_LINK_CTA,
  APPLY_WALLET_LOADING,
  APPLY_WALLET_LOAD_FAILED,
  APPLY_WALLET_RETRY,
  APPLY_SUCCESS,
  WITHDRAW_SUCCESS,
  RELEASE_SUCCESS,
  APPLICANT_REVIEW_GUIDANCE,
  APPLICANT_REVIEW_INFORMATION,
  APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL,
  WITHDRAW_CONFIRM,
  RELEASE_CONFIRM,
  APPLICANTS_EMPTY,
  MY_APPLICATIONS_EMPTY,
  UNASSIGN_WINDOW_INFORMATION,
  applicantsCtaLabel,
  applicationStatusLine,
  applicantStatusLine,
  openApplicationLine,
  type NoticeContent,
} from './gig-applications-copy'
