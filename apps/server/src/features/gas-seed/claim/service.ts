/**
 * The claim surface's behaviour: read availability, and take a claim.
 *
 * Orchestration only — the DECISION is `./eligibility` (pure) and the reads are
 * `./store` plus the dispatch store this reuses. Keeping it that way is what
 * lets both endpoints run one evaluator over one set of facts.
 */

import { ErrorCode, findChain, isChainEnabled } from '@tenda/shared'
import type {
  GasSeedAvailability,
  GasSeedAvailabilityResponse,
  GasSeedClaimResponse,
  SessionClient,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { GasSeedStore, SeedableChain } from './grants'
import type { GasSeedFunder } from '../senders'
import {
  claimRefusal,
  evaluateClaim,
  grantState,
  type ChainClaimFacts,
  type ClaimantFacts,
} from './eligibility'
import type { GasSeedClaimStore } from './store'

/** The background job that performs the transfer, as this module needs it. */
export interface GasSeedClaimJob {
  user_id: string
  chain_id: string
}

export interface GasSeedClaimDeps {
  /** Reused from #53a: seedable chains, the signing wallet, the claim insert. */
  seed: GasSeedStore
  claim: GasSeedClaimStore
  funders: ReadonlyMap<string, GasSeedFunder>
  /**
   * Enqueue the transfer, or NULL when this deployment has no queue.
   *
   * Null refuses the claim rather than performing the transfer inline. A claim
   * whose slot is taken but whose job nothing will ever run leaves the user
   * permanently `in_progress` — the one state the surface can never get out
   * of by itself.
   */
  enqueue: ((job: GasSeedClaimJob) => Promise<void>) | null
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void }
}

/** The caller's session, as the gate sees it. */
export interface ClaimIdentity {
  user_id: string
  /**
   * From the JWT, already narrowed to a known client by `parseSessionClient`.
   * Null for API callers and for app builds older than #53c-2; `'web'` for the
   * browser, which the gate refuses BY VALUE — see `CLAIMABLE_FROM`.
   */
  client: SessionClient | null
}

/** A chain the manifest knows to be paused. An unknown id is not paused (the registry owns that question). */
function isPaused(chain_id: string): boolean {
  const entry = findChain(chain_id)
  return entry !== undefined && !isChainEnabled(entry)
}

/**
 * Facts for one chain, WITHOUT the balance.
 *
 * The balance is left null here and filled in only if it turns out to matter —
 * see `verdictFor`. Reading it eagerly would put an RPC round trip on every
 * availability call for every chain, including the ones refused for reasons
 * that have nothing to do with the hot wallet.
 */
async function factsFor(
  deps: GasSeedClaimDeps,
  user_id: string,
  chain: SeedableChain,
  disabled: ReadonlySet<string>,
): Promise<ChainClaimFacts> {
  const [wallet_address, grant] = await Promise.all([
    deps.seed.findWalletAddress(user_id, chain.namespace),
    deps.claim.findGrant(user_id, chain.chain_id),
  ])
  return {
    chain_id: chain.chain_id,
    amount_raw: chain.gas_seed_amount_raw,
    sender_configured: deps.funders.has(chain.chain_id),
    // Off for an operator-disabled chain AND for a paused one: a seed is a way
    // IN (it onboards a new user onto the chain), which a pause refuses.
    claims_enabled: !disabled.has(chain.chain_id) && !isPaused(chain.chain_id),
    funder_balance: null,
    wallet_address,
    grant,
  }
}

/**
 * The verdict for one chain, reading the hot-wallet balance only when it is the
 * last thing standing.
 *
 * The two-phase shape leans on a property of `evaluateClaim`: with a null
 * balance it returns `funder_empty` EXACTLY when every other check passed,
 * because the balance is its last test. So a first pass with null is both the
 * real answer for every other case and the signal that a balance read is now
 * worth its round trip.
 */
async function verdictFor(
  deps: GasSeedClaimDeps,
  claimant: ClaimantFacts,
  facts: ChainClaimFacts,
): Promise<GasSeedAvailability> {
  const dry = evaluateClaim(claimant, facts)
  if (dry.reason !== 'funder_empty') return dry

  const funder = deps.funders.get(facts.chain_id)
  if (funder === undefined) return dry
  let funder_balance: bigint | null = null
  try {
    funder_balance = await funder.balance()
  } catch (err) {
    // A chain whose RPC is unreachable cannot pay. Reported as `funder_empty`
    // (the null path in evaluateClaim) rather than thrown, so one sick chain
    // does not take the whole availability response down with it.
    deps.log.warn({ err, chain_id: facts.chain_id }, 'gas seed: funder balance unreadable')
  }
  return evaluateClaim(claimant, { ...facts, funder_balance })
}

/** Per-user, per-chain availability. Never cache this globally — it is user-scoped. */
export async function gasSeedAvailability(
  deps: GasSeedClaimDeps,
  identity: ClaimIdentity,
): Promise<GasSeedAvailabilityResponse> {
  const [chains, disabled, accountFacts] = await Promise.all([
    deps.seed.findSeedableChains(),
    deps.claim.disabledChains(),
    deps.claim.claimantFacts(identity.user_id),
  ])
  const claimant: ClaimantFacts = { ...accountFacts, client: identity.client }

  const verdicts = await Promise.all(
    chains.map(async (chain) =>
      verdictFor(deps, claimant, await factsFor(deps, identity.user_id, chain, disabled)),
    ),
  )
  return { chains: verdicts }
}

/**
 * Take the claim: check, reserve the slot, then queue the transfer.
 *
 * CLAIM BEFORE SEND — the `(user_id, chain_id)` primary key is what makes a
 * double-pay impossible, and it only helps if the row exists before any money
 * moves. ./job carries that discipline one step further: it records the signed
 * transaction's reference before broadcasting it.
 */
export async function claimGasSeed(
  deps: GasSeedClaimDeps,
  identity: ClaimIdentity,
  chain_id: string,
): Promise<GasSeedClaimResponse> {
  const [chains, disabled, accountFacts] = await Promise.all([
    deps.seed.findSeedableChains(),
    deps.claim.disabledChains(),
    deps.claim.claimantFacts(identity.user_id),
  ])
  const claimant: ClaimantFacts = { ...accountFacts, client: identity.client }
  const chain = chains.find((c) => c.chain_id === chain_id)

  // An unknown or unseedable chain id gets the same answer as a known chain
  // that offers nothing: this endpoint must not be a probe for which chains a
  // deployment runs.
  if (chain === undefined) {
    throw claimRefusal({
      chain_id,
      available: false,
      amount_raw: null,
      state: 'unclaimed',
      reason: 'not_offered',
    })
  }

  const facts = await factsFor(deps, identity.user_id, chain, disabled)
  const verdict = await verdictFor(deps, claimant, facts)

  // A grant this user ALREADY holds is a success, not a refusal: they asked for
  // their seed and their seed is on its way (or already arrived). Answering
  // with an error would also make the endpoint's behaviour depend on timing —
  // a second tap that arrives after the first row lands would 409, while one
  // that races it would lose the insert below and get a 202. Same action, same
  // answer, either way.
  if (verdict.reason === 'already_granted') {
    return {
      chain_id,
      state: verdict.state,
      amount_raw: chain.gas_seed_amount_raw,
      queued: false,
    }
  }
  if (!verdict.available) throw claimRefusal(verdict)

  // Checked AFTER the verdict so a user on a chain that is switched off is told
  // that, rather than being told the queue is down. Before the claim, though —
  // reserving a slot no worker will ever service is the one unrecoverable state.
  if (deps.enqueue === null) {
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      'gas seed claims are temporarily unavailable',
    )
  }

  // Looked up again rather than carried out of the verdict, and guarded rather
  // than asserted. `sender_configured` came from `funders.has(chain_id)`, so in
  // the ordinary case this is present — but the funder map is process-wide
  // (see ./deps) and can be rebuilt between the verdict and here, so a missing
  // entry is possible rather than impossible. The claim still stands; only the
  // `funder_address` stamp is skipped, which degrades an audit field instead of
  // failing a payout the user was already told they could have.
  const funder = deps.funders.get(chain_id)
  const amount_raw = chain.gas_seed_amount_raw
  // No tx_ref: nothing has been signed, and since #58 that absence is spelled as
  // a NULL reference plus status `claimed` rather than as a `pending:` string
  // standing in for a transaction that does not exist.
  const claimed = await deps.seed.claimGrant({
    user_id: identity.user_id,
    chain_id,
    amount_raw,
    ...(facts.wallet_address !== null ? { wallet_address: facts.wallet_address } : {}),
    ...(funder !== undefined ? { funder_address: funder.address } : {}),
  })

  // Lost the insert race — a second tap, a retry, or another device. The slot is
  // held by the request that won, whose job is already queued, so this reports
  // the truth ("under way") instead of enqueueing a second transfer.
  if (!claimed) {
    const grant = await deps.claim.findGrant(identity.user_id, chain_id)
    return { chain_id, state: grantState(grant), amount_raw, queued: false }
  }

  try {
    await deps.enqueue({ user_id: identity.user_id, chain_id })
  } catch (err) {
    // The slot is reserved and nothing will service it. Release, so the user can
    // try again — nothing has been signed, let alone broadcast, which is exactly
    // the case where releasing is safe. ./job draws the opposite conclusion once
    // a transaction exists: see its `broadcast-uncertain` branch.
    await deps.seed.releaseGrant(identity.user_id, chain_id)
    deps.log.warn({ err, user_id: identity.user_id, chain_id }, 'gas seed claim could not be queued')
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      'gas seed claims are temporarily unavailable',
    )
  }

  deps.log.info({ user_id: identity.user_id, chain_id, amount_raw }, 'gas seed claimed')
  return { chain_id, state: 'in_progress', amount_raw, queued: true }
}
