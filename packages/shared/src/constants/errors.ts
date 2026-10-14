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
  /** The transaction must be signed by a specific wallet and the request named
   *  (or implies) a different one. `details.required_address` carries the
   *  wallet that CAN sign: the on-chain bound party address for transitions on
   *  an existing escrow, or — for a client-requested signer that isn't a
   *  verified linked wallet of the caller — absent (nothing to switch to;
   *  the fix is linking, not switching). */
  ESCROW_WRONG_WALLET:           'ESCROW_WRONG_WALLET',
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
  /** Any request refused by the per-IP / per-route rate limiter (429). OTP sends keep their own code below. */
  RATE_LIMITED:                  'RATE_LIMITED',
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
  /**
   * Relayed funding (x402) cannot be offered on this CHAIN: the deployment
   * holds no relayer for it (503). The message names the chains it can relay
   * on. The caller falls back to signing and broadcasting the create
   * transaction itself, or chooses a chain whose registry entry says
   * `relayed_funding_available`.
   */
  RELAY_UNAVAILABLE:             'RELAY_UNAVAILABLE',
  /**
   * Relayed funding cannot be offered for this ASSET on this chain (422): the
   * asset is not declared for it, is a native token, lacks EIP-3009 on the
   * live token, or its domain does not match. Split from RELAY_UNAVAILABLE
   * (#143) so a client branches on the code, not the status — two conditions
   * used to share one code at two statuses.
   */
  RELAY_UNSUPPORTED_ASSET:       'RELAY_UNSUPPORTED_ASSET',
  /**
   * The payment artifact in X-PAYMENT was refused before broadcast: it does
   * not match the terms, its signature does not verify, its window has
   * lapsed, or the relayed transaction fails simulation. `details.reason`
   * names which. Distinct from VALIDATION_ERROR (a malformed header).
   */
  RELAY_REJECTED:                'RELAY_REJECTED',
  /**
   * The chain is PAUSED (422): deployed and known, switched off by decision.
   * Refused on the ways IN (a new escrow, a new accept or assignment); every
   * way OUT stays open, so nothing already on the chain is stranded. Same
   * family as RELAY_UNSUPPORTED_ASSET: this deployment will not take what the
   * body asked for — choose another chain from GET /v1/platform/chains.
   */
  CHAIN_PAUSED:                  'CHAIN_PAUSED',
  /** Submit refused: the gig requires proof types the worker has not attached. */
  PROOF_REQUIREMENT_UNMET:       'PROOF_REQUIREMENT_UNMET',
  /**
   * Proof-add refused: the payload failed its check against the gig's declared
   * params — a geotag outside radius_m (verification), or structured values
   * not matching the declared fields (conformance). Distinct from
   * VALIDATION_ERROR (malformed payload) so a client can say "your evidence
   * is well-formed but does not satisfy this gig" precisely.
   */
  PROOF_CHECK_FAILED:            'PROOF_CHECK_FAILED',
  /** Accept refused: the worker already holds the maximum concurrent gigs. */
  GIG_CAPACITY_REACHED:          'GIG_CAPACITY_REACHED',
  /** Apply refused: the worker already holds the maximum open applications. */
  APPLICATION_LIMIT_REACHED:     'APPLICATION_LIMIT_REACHED',
  /** Assign/withdraw refused: the application is withdrawn, expired or settled. */
  APPLICATION_NOT_OPEN:          'APPLICATION_NOT_OPEN',
  /** Apply refused: this gig does not take applications (not approval mode). */
  APPLICATIONS_NOT_OPEN:         'APPLICATIONS_NOT_OPEN',
  // Gas-seed claim (#53c-1)
  /**
   * The seed is claimed from the app, and this session is not one. Covers both
   * halves of the mobile gate — a session minted without the app's client stamp,
   * and an account with no registered device — because the client's response to
   * either is the same sentence, and telling an attacker WHICH half they failed
   * only helps them.
   */
  GAS_SEED_MOBILE_ONLY:          'GAS_SEED_MOBILE_ONLY',
  /**
   * Claims are off for this chain, the chain offers no seed, no hot wallet is
   * configured, or that wallet cannot cover another grant. Deliberately ONE
   * code: every case is "not now, and not your fault", and the availability
   * endpoint is where a client learns which.
   */
  GAS_SEED_UNAVAILABLE:          'GAS_SEED_UNAVAILABLE',
  /** Agents fund their own gas through the x402 relayer; the seed is for humans. */
  GAS_SEED_NOT_FOR_AGENTS:       'GAS_SEED_NOT_FOR_AGENTS',
  /**
   * The anti-sybil gate: a verified phone is what makes one grant per account
   * cost something. Distinct from CONTACT_REQUIRED, which a verified EMAIL
   * satisfies — telling a user with a verified email to "verify a contact"
   * when they already have would be a dead end.
   */
  PHONE_VERIFICATION_REQUIRED:   'PHONE_VERIFICATION_REQUIRED',
  // Generic
  SERVICE_UNAVAILABLE:           'SERVICE_UNAVAILABLE',
  NOT_FOUND:                     'NOT_FOUND',
  /**
   * Carried by 400, 422 AND 409 responses — do not branch on the status to
   * tell them apart, branch on this code. The server's rule for which status
   * a new route should pick is written at the top of
   * apps/server/src/lib/errors.ts (#60).
   */
  VALIDATION_ERROR:              'VALIDATION_ERROR',
  INTERNAL_ERROR:                'INTERNAL_ERROR',
  /** The client stopped waiting before an authoritative response arrived. */
  REQUEST_TIMEOUT:               'REQUEST_TIMEOUT',
} as const

export type ErrorCode = keyof typeof ErrorCode
