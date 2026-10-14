/**
 * The BROADCAST half of a claim: sign the transfer, record it, put it on chain.
 *
 * WHY IT IS A JOB. The claim endpoint answers 202 and returns immediately;
 * reaching a chain is not something a user should hold a spinner for. The slot
 * is reserved synchronously — that is what makes double-paying impossible — and
 * only the money moves out of band.
 *
 * WHY IT NO LONGER CONFIRMS, which is the #58 rework. This job used to call one
 * `send()` that broadcast AND waited for confirmation, then interpret the
 * result. A wait that timed out was indistinguishable from a transfer that
 * failed, so the code had to guess, and both guesses cost real money: releasing
 * the slot paid users twice, keeping it stranded users who were never paid.
 *
 * The order below is the fix, and every step of it is load-bearing:
 *
 *   1. sign          — a signed transaction has its final reference, and no
 *                      money has moved.
 *   2. markSubmitted — that reference is now durable. A crash from here on is
 *                      recoverable, because something in the database points at
 *                      the transaction.
 *   3. broadcast     — money may now move.
 *   4. enqueue       — ./confirm asks the chain what became of it, and retries
 *                      for as long as the chain has no answer.
 *
 * Nothing in this file decides whether a transfer succeeded. It cannot: at the
 * moment it finishes, the chain does not know either.
 */

import type { GasSeedSender, GasSeedStore } from './grants'
import type { GasSeedFunder } from '../senders'
import type { GasSeedClaimStore } from './store'
import type { GasSeedClaimJob } from './service'

export interface GasSeedJobDeps {
  seed: Pick<GasSeedStore, 'markSubmitted' | 'releaseGrant'>
  claim: Pick<GasSeedClaimStore, 'findGrantForJob'>
  senders: ReadonlyMap<string, GasSeedSender>
  /**
   * The paying wallets, for the pre-flight below.
   *
   * Built FRESH per job rather than shared with the availability endpoint, whose
   * map memoises each balance for 30 seconds. That memo is right for a polled UI
   * hint and wrong for the read that decides whether to sign: claims cluster, and
   * several jobs inside one TTL window would all see the same pre-drain balance
   * and all sign against a wallet that covers one of them. See
   * `buildGasSeedJobDeps` for the whole argument.
   *
   * Keyed the same way as `senders`, and by construction over the same secrets —
   * a funder set that disagreed with the sender set would refuse a chain that
   * can pay, or sign on one that cannot.
   */
  funders: ReadonlyMap<string, GasSeedFunder>
  /** Queue the confirmation. Failing to enqueue is NOT failing to pay — see below. */
  enqueueConfirm(job: GasSeedClaimJob): Promise<void>
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void }
  now?: () => Date
}

/** What became of one claim, for the worker's log and for tests to assert on. */
export type GasSeedJobOutcome =
  | 'submitted'
  | 'no-claim'
  | 'already-submitted'
  | 'already-delivered'
  | 'no-wallet'
  | 'sender-missing'
  | 'funder-empty'
  | 'sign-failed'
  | 'broadcast-uncertain'

/**
 * Sign, record and broadcast one claimed seed.
 *
 * NEVER THROWS, WITH ONE EXCEPTION, and the exception is the interesting part.
 *
 * Every ordinary exit is a recorded outcome, because a throw hands the job back
 * to BullMQ and a retry cannot help: either the slot was released (so the retry
 * finds nothing) or a transaction was already signed and recorded (so the retry
 * must not sign a second one). Retrying an unconfirmed transfer is ./confirm's
 * job, and it retries against the chain rather than against the wallet.
 *
 * FAILING TO QUEUE THE CONFIRMATION IS THE EXCEPTION, and it throws. That case
 * is retryable precisely because a redelivery is harmless here: it finds the
 * grant `submitted`, refuses to sign anything, and re-queues the confirmation —
 * which is the one thing that was missing. Swallowing it (as this did at first)
 * leaves a grant NOTHING can resolve: the row is `submitted`, no confirmation
 * exists, and `unresolved` is unreachable because only the confirm job can set
 * it. The comment there claimed "an operator or a re-delivery drives it", and no
 * re-delivery was coming — the job had returned successfully.
 */
export async function handleGasSeedClaim(
  deps: GasSeedJobDeps,
  job: GasSeedClaimJob,
): Promise<GasSeedJobOutcome> {
  const { user_id, chain_id } = job
  const now = deps.now ?? ((): Date => new Date())
  const grant = await deps.claim.findGrantForJob(user_id, chain_id)

  // The claim was released between enqueue and delivery (the endpoint's own
  // rollback, or an operator). Nothing was promised, so nothing is owed.
  if (grant === null) {
    deps.log.warn({ user_id, chain_id }, 'gas seed job: no claim to pay')
    return 'no-claim'
  }

  // A redelivered job for a grant that already finished. Paying again is exactly
  // what the primary key exists to prevent.
  if (grant.status === 'delivered') {
    deps.log.info({ user_id, chain_id, tx_ref: grant.tx_ref }, 'gas seed job: already delivered')
    return 'already-delivered'
  }

  // A redelivered job for a transaction a previous attempt already signed and
  // recorded. Signing a second one would put TWO transfers on the chain for one
  // grant. Re-queue the confirmation instead — that is idempotent, and the
  // previous attempt may have died before it managed to.
  if (grant.status === 'submitted') {
    await deps.enqueueConfirm(job)
    deps.log.info({ user_id, chain_id, tx_ref: grant.tx_ref }, 'gas seed job: already submitted')
    return 'already-submitted'
  }

  // Both of these are reachable only if the world changed after the claim was
  // accepted — the wallet was unlinked, or the chain's key was pulled. Release
  // rather than hold: there is nothing to pay to, or nothing to pay with.
  if (grant.wallet_address === null) {
    await deps.seed.releaseGrant(user_id, chain_id)
    deps.log.warn({ user_id, chain_id }, 'gas seed job: claim has no wallet, released')
    return 'no-wallet'
  }
  const sender = deps.senders.get(chain_id)
  if (sender === undefined) {
    await deps.seed.releaseGrant(user_id, chain_id)
    deps.log.warn({ user_id, chain_id }, 'gas seed job: no sender configured, released')
    return 'sender-missing'
  }

  // PRE-FLIGHT, and it earns its round trip. An empty hot wallet is an ordinary
  // operational state — it is what the low-balance alert exists to announce —
  // and it makes the node REFUSE the broadcast. Discovering that after signing
  // would leave a recorded transaction that can never land, which on a chain
  // whose transactions do not expire is a grant nothing can resolve. Checked
  // here, it is simply a released slot the user can claim again later.
  //
  // An unreadable balance does NOT block the claim: `balance()` failing is an
  // RPC problem, and refusing to pay because a read failed would strand a user
  // over a transient outage. The broadcast is allowed to be the judge then.
  const funder = deps.funders.get(chain_id)
  if (funder !== undefined && !(await canCover(funder, grant.amount_raw, deps, job))) {
    await deps.seed.releaseGrant(user_id, chain_id)
    deps.log.warn({ user_id, chain_id }, 'gas seed job: hot wallet cannot cover the grant, released')
    return 'funder-empty'
  }

  let signed: Awaited<ReturnType<GasSeedSender['sign']>>
  try {
    signed = await sender.sign({ to_address: grant.wallet_address, amount_raw: grant.amount_raw })
  } catch (err) {
    // Nothing was broadcast — signing contacts the chain only for a nonce or a
    // blockhash — so releasing is provably safe here.
    await deps.seed.releaseGrant(user_id, chain_id)
    deps.log.warn({ err, user_id, chain_id }, 'gas seed job: could not sign, claim released')
    return 'sign-failed'
  }

  // BEFORE the broadcast, deliberately. From this write onward the transaction
  // is attributable no matter what happens to this process.
  const recorded = await deps.seed.markSubmitted({
    user_id,
    chain_id,
    tx_ref: signed.tx_ref,
    submitted_at: now(),
  })
  if (!recorded) {
    // The status guard refused: a concurrent attempt recorded its own
    // transaction first. Ours must NOT be broadcast — two transfers for one
    // grant is the double-pay this whole ordering exists to prevent.
    await deps.enqueueConfirm(job)
    deps.log.warn({ user_id, chain_id }, 'gas seed job: another attempt already recorded a transfer')
    return 'already-submitted'
  }

  try {
    await signed.broadcast()
  } catch (err) {
    // A broadcast that throws is genuinely AMBIGUOUS — the node may have
    // accepted the transaction and then dropped the connection. The slot stays
    // taken, because releasing on a maybe is how a user gets paid twice, and
    // ./confirm resolves it against the chain like any other unconfirmed
    // transfer. Recorded as its own outcome so the log says which happened.
    await deps.enqueueConfirm(job)
    deps.log.warn(
      { err, user_id, chain_id, tx_ref: signed.tx_ref },
      'gas seed job: broadcast failed after the transfer was recorded — confirmation will settle it',
    )
    return 'broadcast-uncertain'
  }

  // Enqueued AFTER the broadcast, and a failure here THROWS — see the header.
  // The money is already on its way and the row records it, so releasing would
  // be the one unforgivable move; but returning quietly would leave a transfer
  // no job will ever ask the chain about. Throwing hands it back to BullMQ,
  // whose redelivery re-queues the confirmation without signing again.
  await deps.enqueueConfirm(job)

  deps.log.info({ user_id, chain_id, tx_ref: signed.tx_ref }, 'gas seed job: submitted')
  return 'submitted'
}

/** Can the hot wallet still cover this grant? An unreadable balance answers yes. */
async function canCover(
  funder: GasSeedFunder,
  amount_raw: string,
  deps: GasSeedJobDeps,
  job: GasSeedClaimJob,
): Promise<boolean> {
  try {
    return (await funder.balance()) >= BigInt(amount_raw)
  } catch (err) {
    deps.log.warn({ err, ...job }, 'gas seed job: funder balance unreadable, proceeding')
    return true
  }
}
