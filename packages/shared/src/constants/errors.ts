export const ErrorCode = {
  // Auth
  INVALID_WALLET_ADDRESS:        'INVALID_WALLET_ADDRESS',
  INVALID_SIGNATURE:             'INVALID_SIGNATURE',
  UNAUTHORIZED:                  'UNAUTHORIZED',
  FORBIDDEN:                     'FORBIDDEN',
  // Users
  USER_NOT_FOUND:                'USER_NOT_FOUND',
  USER_SUSPENDED:                'USER_SUSPENDED',
  // Gigs
  GIG_NOT_FOUND:                 'GIG_NOT_FOUND',
  GIG_WRONG_STATUS:              'GIG_WRONG_STATUS',
  CANNOT_ACCEPT_OWN_GIG:         'CANNOT_ACCEPT_OWN_GIG',
  ACCEPT_DEADLINE_PASSED:        'ACCEPT_DEADLINE_PASSED',
  COMPLETION_DEADLINE_PASSED:    'COMPLETION_DEADLINE_PASSED',
  // Disputes / grace period
  DISPUTE_ALREADY_EXISTS:        'DISPUTE_ALREADY_EXISTS',
  GRACE_PERIOD_EXPIRED:          'GRACE_PERIOD_EXPIRED',
  // CO7 — mediation threads (claim-based assignment)
  DISPUTE_ALREADY_CLAIMED:       'DISPUTE_ALREADY_CLAIMED',
  DISPUTE_RESOLVED:              'DISPUTE_RESOLVED',
  // Issue-3 — resolution propose→sign queue
  DISPUTE_NOT_CLAIMED:           'DISPUTE_NOT_CLAIMED',
  RESOLUTION_ALREADY_EXISTS:     'RESOLUTION_ALREADY_EXISTS',
  RESOLUTION_NOT_FOUND:          'RESOLUTION_NOT_FOUND',
  RESOLUTION_NOT_ACTIVE:         'RESOLUTION_NOT_ACTIVE',
  // Reviews
  REVIEW_ALREADY_EXISTS:         'REVIEW_ALREADY_EXISTS',
  REVIEW_NOT_ALLOWED:            'REVIEW_NOT_ALLOWED',
  // Blockchain
  SIGNATURE_NOT_FINALIZED:       'SIGNATURE_NOT_FINALIZED',
  SIGNATURE_VERIFICATION_FAILED: 'SIGNATURE_VERIFICATION_FAILED',
  DUPLICATE_SIGNATURE:           'DUPLICATE_SIGNATURE',
  ESCROW_NOT_FUNDED:             'ESCROW_NOT_FUNDED',
  ESCROW_MISMATCH:               'ESCROW_MISMATCH',
  /** A chain-level prerequisite (e.g. the dispute-resolution authority) is not
   *  configured on the server for the target chain. */
  CHAIN_NOT_CONFIGURED:          'CHAIN_NOT_CONFIGURED',
  // Moderation
  CONTENT_MODERATED:             'CONTENT_MODERATED',
  CANNOT_REPORT_SELF:            'CANNOT_REPORT_SELF',
  /** CO1 takedown: the listing is hidden, so no new participant may enter it.
   *  Distinct from ESCROW_WRONG_STATUS — the state machine is fine, the
   *  PLATFORM is refusing — and the parties' exits are unaffected. */
  ESCROW_TAKEN_DOWN:             'ESCROW_TAKEN_DOWN',
  // Escrow state machine (v2 — used by lib/escrow.ts state-transition guards)
  ESCROW_WRONG_STATUS:           'ESCROW_WRONG_STATUS',
  ESCROW_WRONG_CALLER:           'ESCROW_WRONG_CALLER',
  ESCROW_DEADLINE_PASSED:        'ESCROW_DEADLINE_PASSED',
  ESCROW_DEADLINE_NOT_REACHED:   'ESCROW_DEADLINE_NOT_REACHED',
  ESCROW_INVALID_ASSET:          'ESCROW_INVALID_ASSET',
  // Auth nonces (v2 — used by lib/nonce.ts; replaces ±5min timestamp window)
  AUTH_NONCE_UNKNOWN:            'AUTH_NONCE_UNKNOWN',
  AUTH_NONCE_REPLAY:             'AUTH_NONCE_REPLAY',
  AUTH_NONCE_EXPIRED:            'AUTH_NONCE_EXPIRED',
  // Stage 7 — reputation restrictions
  USER_RESTRICTED:               'USER_RESTRICTED',
  ACCOUNT_UNDER_REVIEW:          'ACCOUNT_UNDER_REVIEW',
  // Stage 1 — onboarding (phone OTP, multi-wallet management)
  PROFILE_INCOMPLETE:            'PROFILE_INCOMPLETE',
  /** Refused: this wallet is a party to an active escrow on its chain. */
  WALLET_IN_USE:                 'WALLET_IN_USE',
  /** Refused: can't unlink the PRIMARY wallet while another remains — set a new
   *  primary first. Distinct from WALLET_IN_USE so the client shows the right
   *  message (not the active-escrow copy). */
  WALLET_IS_PRIMARY:             'WALLET_IS_PRIMARY',
  OTP_RATE_LIMITED:              'OTP_RATE_LIMITED',
  OTP_INVALID:                   'OTP_INVALID',
  OTP_EXPIRED:                   'OTP_EXPIRED',
  // #84–#87 — admin email-OTP login (admin_users registry)
  EMAIL_IN_USE:                  'EMAIL_IN_USE',
  // Stage 9 — multi-method passwordless auth
  /** Linking an identity that already belongs to a different account (block, no merge). */
  IDENTITY_ALREADY_LINKED:       'IDENTITY_ALREADY_LINKED',
  /** Wallet sign-in for a wallet not yet attached to any account — wallet signs in, never creates. */
  WALLET_NOT_LINKED:             'WALLET_NOT_LINKED',
  /** Transaction gate: the action needs a linked wallet for the target chain. */
  WALLET_REQUIRED:               'WALLET_REQUIRED',
  /** Transaction gate: the action needs at least one verified contact (email/phone). */
  CONTACT_REQUIRED:              'CONTACT_REQUIRED',
  /** Direct-assign create: the assigned counterparty has no wallet on the chain
   *  (their address must be baked into the escrow at creation). Distinct from
   *  WALLET_REQUIRED — it's the ASSIGNEE, not the caller, who must link one. */
  ASSIGNEE_WALLET_REQUIRED:      'ASSIGNEE_WALLET_REQUIRED',
  /** Refused: removing this credential would leave the account with no way to sign in. */
  LAST_CREDENTIAL:               'LAST_CREDENTIAL',
  /** Refused: removing this wallet would leave the account with no linked wallet
   *  (a wallet is required to transact — stricter than LAST_CREDENTIAL, which a
   *  verified email/phone would otherwise satisfy). */
  LAST_WALLET:                   'LAST_WALLET',
  /** Unknown/unsupported auth method kind on the generic challenge/verify routes. */
  UNSUPPORTED_AUTH_METHOD:       'UNSUPPORTED_AUTH_METHOD',
  // Stage 8 — fiat rails
  QUOTE_EXPIRED:                 'QUOTE_EXPIRED',
  FIAT_RAILS_DISABLED:           'FIAT_RAILS_DISABLED',
  PROVIDER_UNAVAILABLE:          'PROVIDER_UNAVAILABLE',
  BANK_ACCOUNT_INVALID:          'BANK_ACCOUNT_INVALID',
  // EIP-2612 permit — the client's signal to FALL BACK to the approve flow
  // (asset/chain has no permit support, or the token's live domain no longer
  // matches config).
  PERMIT_UNAVAILABLE:            'PERMIT_UNAVAILABLE',
  /** Submit refused: the gig requires proof types the worker has not attached. */
  PROOF_REQUIREMENT_UNMET:       'PROOF_REQUIREMENT_UNMET',
  /** Accept refused: the worker already holds the maximum concurrent gigs. */
  GIG_CAPACITY_REACHED:          'GIG_CAPACITY_REACHED',
  /** Apply refused: the worker already holds the maximum open applications. */
  APPLICATION_LIMIT_REACHED:     'APPLICATION_LIMIT_REACHED',
  /** Assign/withdraw refused: the application is withdrawn, expired or settled. */
  APPLICATION_NOT_OPEN:          'APPLICATION_NOT_OPEN',
  /** Apply refused: this gig does not take applications (not approval mode). */
  APPLICATIONS_NOT_OPEN:         'APPLICATIONS_NOT_OPEN',
  // Generic
  SERVICE_UNAVAILABLE:           'SERVICE_UNAVAILABLE',
  NOT_FOUND:                     'NOT_FOUND',
  VALIDATION_ERROR:              'VALIDATION_ERROR',
  INTERNAL_ERROR:                'INTERNAL_ERROR',
  /** The client stopped waiting before an authoritative response arrived. */
  REQUEST_TIMEOUT:               'REQUEST_TIMEOUT',
} as const

export type ErrorCode = keyof typeof ErrorCode
