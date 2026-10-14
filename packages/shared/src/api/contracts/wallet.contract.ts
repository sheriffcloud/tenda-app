import type { Endpoint } from '../endpoint'

/**
 * The gas-seed CLAIM surface (#53c-1) — the wallet-scoped endpoints a client
 * uses to see whether a one-time native-gas grant is available on a chain, and
 * to ask for it.
 *
 * Claiming replaced automatic sending because sending crypto nobody asked for
 * has real gray area: the user may not notice, may not want it, and the spend
 * lands on everyone who ever linked a wallet rather than on the people who came
 * back. A claim is an affirmative act and is demand-driven.
 */

/**
 * What a user's grant looks like on one chain. DERIVED from `gas_grants` — no
 * status column exists, and adding one would put a second source of truth
 * beside the `pending:` tx_ref prefix that `verify-gas-seed.ts` already reads.
 *
 * `in_progress` deliberately covers BOTH "the job is queued or mid-flight" and
 * "the transfer landed but the row could not be stamped". Those are the same
 * row in the database — a `pending:` tx_ref — and separating them would mean
 * either a status column or a claim about the chain that the server cannot
 * actually make. They also call for identical behaviour: never re-offer the
 * claim, and never say "already claimed" to someone who double-tapped.
 */
export type GasSeedState = 'unclaimed' | 'in_progress' | 'claimed'

/**
 * Why a claim is not on offer. Present iff `available` is false, so a client
 * renders one specific sentence instead of a generic "unavailable".
 */
export type GasSeedUnavailableReason =
  /** This chain declares no seed, or the deployment configured no hot wallet. */
  | 'not_offered'
  /** An operator switched claims off for this chain (usually a key rotation). */
  | 'claims_disabled'
  /** The hot wallet cannot cover one more grant. Operators are alerted; users wait. */
  | 'funder_empty'
  /** The user has no wallet on this chain, so there is nowhere to pay. */
  | 'no_wallet'
  /** Already granted, in flight, or granted-but-unstamped — see `state`. */
  | 'already_granted'
  /**
   * The session is not the app. Web sees this and says "claim in the app"
   * rather than offering a button that would 403 — which is why availability
   * applies the SAME gate the claim does, instead of reporting a chain-level
   * truth the caller cannot act on.
   */
  | 'mobile_only'
  /** The anti-sybil gate: verify a phone number first. Actionable, so named. */
  | 'phone_required'
  /**
   * Suspended accounts and agents. Deliberately ONE opaque bucket: an agent
   * needs no explanation (it has the relayer) and a suspended account must not
   * be handed a checklist of what to fix.
   */
  | 'not_eligible'

export interface GasSeedAvailability {
  chain_id: string
  /** True only when a claim would be accepted right now, for THIS user. */
  available: boolean
  /** Base units of the chain's native token, or null when nothing is offered. */
  amount_raw: string | null
  state: GasSeedState
  reason: GasSeedUnavailableReason | null
}

/** Per-user, per-chain availability. Never cached globally — it is user-scoped. */
export interface GasSeedAvailabilityResponse {
  chains: GasSeedAvailability[]
}

export interface GasSeedClaimBody {
  chain_id: string
}

/**
 * The answer to a claim. 202: the slot is taken and the transfer is queued —
 * `queued` says whether THIS request is what enqueued it, so a double-tap is
 * truthfully reported as "already under way" rather than as a second grant.
 */
export interface GasSeedClaimResponse {
  chain_id: string
  state: GasSeedState
  amount_raw: string
  /** False when the claim was already held (double-tap, retry, second device). */
  queued: boolean
}

export interface WalletContract {
  /** Per-chain gas-seed availability for the calling user. */
  gasSeedAvailability: Endpoint<'GET', undefined, undefined, undefined, GasSeedAvailabilityResponse>
  /**
   * Claim this chain's one-time native gas seed.
   *
   * NOT `/claim`: `POST /v1/escrows/:id/claim` already means claiming a stalled
   * payment, and blurring the two words where money moves is how someone reads
   * the wrong runbook. The resource is the seed; asking for it is a POST to it.
   */
  claimGasSeed: Endpoint<'POST', undefined, GasSeedClaimBody, undefined, GasSeedClaimResponse>
}
