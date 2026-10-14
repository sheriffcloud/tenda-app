/**
 * MAY this user claim this chain's seed, right now — the one decision both
 * endpoints run.
 *
 * ONE evaluator, deliberately. `GET /v1/wallet/gas-seed` answers with what it
 * returns and `POST` enforces it, so the two cannot drift into the worst
 * failure this surface has: a button the client was told to show, that the
 * server then refuses. Every guard is re-derived here from server state on
 * every call — nothing is trusted from the client, and nothing is remembered
 * from a previous answer.
 *
 * PURE. It takes facts and returns a verdict, so every branch below is
 * reachable from a unit test without a database, an RPC or a signed token.
 */

import { ErrorCode } from '@tenda/shared'
import type {
  GasGrantStatus,
  GasSeedAvailability,
  GasSeedState,
  GasSeedUnavailableReason,
  SessionClient,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/** The grant row as this decision needs it: does one exist, and where is it. */
export interface GrantFacts {
  status: GasGrantStatus
}

/**
 * The client the seed may be claimed from.
 *
 * Compared by VALUE, not merely for presence. `client !== null` would admit a
 * session stamped `'web'` — and a user who had installed the app (so a
 * `device_tokens` row exists) could then claim from the browser, which is the
 * whole gate defeated by the one client it was meant to exclude. Typed as
 * `SessionClient` so a renamed client is a compile error rather than a gate
 * that silently stops matching anything.
 */
const CLAIMABLE_FROM: SessionClient = 'mobile'

/** What the server knows about the claimant, all re-read at claim time. */
export interface ClaimantFacts {
  /**
   * Which client minted this session, from the JWT (`mintAuthResponse`).
   * Web sessions and pre-#53c-2 app builds are refused — the latter is what
   * makes shipping this ahead of the client safe: nothing can claim yet.
   */
  client: SessionClient | null
  /** A registered push device. The second half of the mobile gate. */
  has_device_token: boolean
  /** The anti-sybil gate. A verified EMAIL does not satisfy it. */
  has_verified_phone: boolean
  /**
   * Re-read here on purpose: `mintAuthResponse` refuses a suspended user at
   * LOGIN, but tokens live for days, so a user suspended after signing in still
   * holds a valid one. A payout endpoint that trusted the token would pay them.
   */
  is_suspended: boolean
  /** Agents fund gas through the x402 relayer; the seed is an install incentive. */
  is_agent: boolean
}

/** What the server knows about the chain and this user's position on it. */
export interface ChainClaimFacts {
  chain_id: string
  /** Null when the chain declares no seed — nothing is on offer. */
  amount_raw: string | null
  /** False when no hot-wallet key is configured for this chain. */
  sender_configured: boolean
  /** False when an operator switched claims off (a key rotation, usually). */
  claims_enabled: boolean
  /**
   * The hot wallet's balance, or null when it could not be read. Null is
   * treated as EMPTY rather than as fine: a chain whose RPC is down cannot pay,
   * and offering a claim that will fail costs the user a wasted tap and the
   * grant slot a needless release.
   */
  funder_balance: bigint | null
  /** The wallet the seed would be paid to, or null if they have none here. */
  wallet_address: string | null
  /** The user's existing grant on this chain, if any. */
  grant: GrantFacts | null
}

/**
 * What each stored status means to a CLIENT.
 *
 * A total `Record`, not a ternary, and that is the whole point: adding a status
 * to GAS_GRANT_STATUSES without deciding what the client sees is a COMPILE
 * error here. The ternary this replaced (`status === 'delivered' ? … : …`)
 * silently mapped anything new to `in_progress` — and the test that claimed to
 * guard against that could not, because a two-armed ternary has no third answer
 * to catch. The compiler can catch it; an assertion could not.
 *
 * THREE OF THE FOUR MAP TO `in_progress`, and that is deliberate rather than
 * lossy. `claimed` (nothing signed yet), `submitted` (broadcast, awaiting the
 * chain) and `unresolved` (broadcast, and we stopped asking) differ in what an
 * OPERATOR must do, not in what the user can do — which in all three cases is
 * wait. Exposing the difference would put an internal recovery state on a
 * consumer surface and invite a client to branch on it; `verify:gas-seed` is
 * where that distinction is meant to be read.
 *
 * `unresolved` deliberately does NOT map to `unclaimed`: the slot is held, so
 * offering the button again would be offering a seed that cannot be claimed.
 */
const CLIENT_STATE: Record<GasGrantStatus, GasSeedState> = {
  claimed: 'in_progress',
  submitted: 'in_progress',
  unresolved: 'in_progress',
  delivered: 'claimed',
}

/**
 * The stored lifecycle, narrowed to the three states the client is given.
 *
 * It used to read a `pending:` prefix off the tx_ref, because there was no
 * status column and the string was carrying the state (#58 gave it one). This
 * is the same decision expressed against the real field.
 */
export function grantState(grant: GrantFacts | null): GasSeedState {
  return grant === null ? 'unclaimed' : CLIENT_STATE[grant.status]
}

/**
 * The verdict for one chain.
 *
 * ORDER MATTERS, and it is ordered by what the user can do about it. Session
 * and account problems come before chain problems, so a web visitor is told
 * "use the app" rather than "this chain is switched off" — both are true, only
 * one is useful. `already_granted` comes last among the refusals so that a user
 * who has already claimed sees that fact rather than a transient outage.
 */
export function evaluateClaim(
  claimant: ClaimantFacts,
  chain: ChainClaimFacts,
): GasSeedAvailability {
  const state = grantState(chain.grant)
  const refuse = (reason: GasSeedUnavailableReason): GasSeedAvailability => ({
    chain_id: chain.chain_id,
    available: false,
    amount_raw: chain.amount_raw,
    state,
    reason,
  })

  // Nothing on offer here at all — said first, because every other refusal
  // would imply that a seed exists on this chain when none does.
  if (chain.amount_raw === null || !chain.sender_configured) return refuse('not_offered')

  if (claimant.is_suspended || claimant.is_agent) return refuse('not_eligible')
  if (claimant.client !== CLAIMABLE_FROM || !claimant.has_device_token) return refuse('mobile_only')
  if (!claimant.has_verified_phone) return refuse('phone_required')

  if (!chain.claims_enabled) return refuse('claims_disabled')
  if (chain.wallet_address === null) return refuse('no_wallet')
  if (state !== 'unclaimed') return refuse('already_granted')

  // Balance last among the chain checks: it is the only one that costs an RPC
  // round trip, and every refusal above makes it irrelevant.
  if (chain.funder_balance === null || chain.funder_balance < BigInt(chain.amount_raw)) {
    return refuse('funder_empty')
  }

  return {
    chain_id: chain.chain_id,
    available: true,
    amount_raw: chain.amount_raw,
    state,
    reason: null,
  }
}

/**
 * Turn a refusal into the error the claim endpoint throws.
 *
 * Here rather than in the route, so the mapping is covered by the same unit
 * tests as the decision that produced it — a route-level switch is reachable
 * only through an HTTP fixture, and the arm nobody wrote a fixture for is the
 * arm that returns the wrong status.
 */
export function claimRefusal(verdict: GasSeedAvailability): AppError {
  switch (verdict.reason) {
    case 'mobile_only':
      return new AppError(
        403,
        ErrorCode.GAS_SEED_MOBILE_ONLY,
        'the gas seed is claimed from the Tenda app',
      )
    case 'phone_required':
      return new AppError(
        403,
        ErrorCode.PHONE_VERIFICATION_REQUIRED,
        'verify your phone number before claiming the gas seed',
      )
    case 'not_eligible':
      return new AppError(
        403,
        ErrorCode.GAS_SEED_NOT_FOR_AGENTS,
        'this account cannot claim the gas seed',
      )
    case 'no_wallet':
      return new AppError(
        403,
        ErrorCode.WALLET_REQUIRED,
        'link a wallet on this chain before claiming its gas seed',
        { chain_id: verdict.chain_id },
      )
    // not_offered / claims_disabled / funder_empty / already_granted, and the
    // `null` a caller reaches only by mapping a verdict that ALLOWED the claim.
    // One code: they are all "not now", the state field carries the nuance, and
    // a client that branched on more would be branching on operational detail.
    default:
      return new AppError(
        409,
        ErrorCode.GAS_SEED_UNAVAILABLE,
        'the gas seed is not available on this chain right now',
        { chain_id: verdict.chain_id, state: verdict.state, reason: verdict.reason },
      )
  }
}
