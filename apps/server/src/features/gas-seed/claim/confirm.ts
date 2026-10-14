/**
 * The CONFIRM half of a claim (#58): ask the chain what became of a transfer we
 * broadcast, and record the answer.
 *
 * This job exists so that nothing has to guess. Its predecessor waited for
 * confirmation inside the send call and turned a wait that timed out into a
 * verdict — which released slots whose money had already left, and stamped
 * grants for transfers that landed and failed. Here a confirmation that has not
 * happened is simply a job that runs again.
 *
 * THE ONLY THREE THINGS IT CAN DO, and each is driven by what the CHAIN said:
 *
 *   delivered  → stamp the grant, notify the user. Terminal.
 *   failed     → the chain attested that the money did not move. Release the
 *                slot so the user can claim again. Terminal.
 *   pending    → the chain has no answer. Retry, until the grant is older than
 *                GAS_SEED_UNRESOLVED_AFTER_MS, at which point stop asking and
 *                mark it `unresolved` for a person to settle.
 *
 * It never releases a slot on `pending`. That is the whole discipline: "no
 * answer" and "it failed" are different, and conflating them is what paid users
 * twice.
 */

import { GAS_SEED_UNRESOLVED_AFTER_MS } from '@tenda/shared'
import { RetryableError } from '@server/queue/jobs/verify-tx'
import type { GasSeedSender, GasSeedStore, GasSeedTransferStatus } from './grants'
import type { GasSeedClaimStore } from './store'
import type { GasSeedClaimJob } from './service'

/** What the transfer needs to tell the user it landed. */
export interface GasSeedGrantedNotice {
  user_id: string
  chain_id: string
  amount_raw: string
  tx_ref: string
}

export interface GasSeedConfirmDeps {
  seed: Pick<GasSeedStore, 'markDelivered' | 'markUnresolved' | 'releaseGrant'>
  claim: Pick<GasSeedClaimStore, 'findGrantForJob'>
  senders: ReadonlyMap<string, GasSeedSender>
  /** Best-effort: a delivered seed the user is not told about is still delivered. */
  notify(notice: GasSeedGrantedNotice): Promise<void>
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void }
  now?: () => Date
}

/** What became of one confirmation, for the worker's log and for tests. */
export type GasSeedConfirmOutcome =
  | 'delivered'
  | 'failed'
  | 'unresolved'
  | 'no-claim'
  | 'not-submitted'
  | 'already-delivered'

/**
 * Resolve one submitted grant against its chain.
 *
 * THROWS `RetryableError` while the chain has no answer, which is the same
 * signal `queue/jobs/verify-tx` uses for an unconfirmed escrow transaction — BullMQ
 * retries it on the queue's backoff. Every other exit is terminal and returns.
 */
export async function handleGasSeedConfirm(
  deps: GasSeedConfirmDeps,
  job: GasSeedClaimJob,
): Promise<GasSeedConfirmOutcome> {
  const { user_id, chain_id } = job
  const now = deps.now ?? ((): Date => new Date())
  const grant = await deps.claim.findGrantForJob(user_id, chain_id)

  if (grant === null) {
    // Released between broadcast and here — an operator, or a concurrent
    // confirmation that already resolved it as failed. Nothing to settle.
    deps.log.warn({ user_id, chain_id }, 'gas seed confirm: no grant')
    return 'no-claim'
  }
  if (grant.status === 'delivered') return 'already-delivered'

  // `claimed` means nothing was ever signed, and `unresolved` means we already
  // stopped asking. Neither has a transaction for this job to ask about, and
  // re-opening `unresolved` automatically would undo a decision that was
  // deliberately handed to a person.
  if (grant.status !== 'submitted' || grant.tx_ref === null || grant.submitted_at === null) {
    deps.log.warn(
      { user_id, chain_id, status: grant.status },
      'gas seed confirm: grant is not awaiting confirmation',
    )
    return 'not-submitted'
  }

  const { tx_ref, submitted_at } = grant
  const sender = deps.senders.get(chain_id)

  // EVERY WAY OF NOT GETTING AN ANSWER COLLAPSES TO `pending`, and that is the
  // rule rather than two coincidences. A chain whose key was pulled cannot be
  // asked; a chain whose RPC is refusing cannot answer. Neither is evidence
  // about the money, so neither may touch the slot — and both must still reach
  // the give-up window below.
  //
  // Letting the read THROW instead was a dead end: the age check never ran, so a
  // persistently failing chain exhausted this job's retries and left the grant
  // `submitted` with nothing remaining to move it — permanently, since the job
  // is gone even once the RPC recovers. The error is logged rather than
  // propagated, so the diagnostic survives without costing the terminal state.
  //
  // The namespaces differ underneath, which is why this cannot live in one leaf:
  // the EVM port already folds a not-found receipt to null, while web3's
  // signature lookup throws outright. This is where they are made to agree.
  const status = await readStatus()

  async function readStatus(): Promise<GasSeedTransferStatus> {
    if (sender === undefined) {
      deps.log.warn({ user_id, chain_id }, 'gas seed confirm: no sender configured, cannot check')
      return 'pending'
    }
    try {
      return await sender.checkStatus({ tx_ref, submitted_at })
    } catch (err) {
      deps.log.warn({ err, user_id, chain_id, tx_ref }, 'gas seed confirm: chain unreadable')
      return 'pending'
    }
  }

  if (status === 'delivered') {
    await deps.seed.markDelivered(user_id, chain_id)
    deps.log.info({ user_id, chain_id, tx_ref }, 'gas seed confirm: delivered')
    // After the stamp, never before: a notification promising gas the user does
    // not have is worse than a late one.
    //
    // And BEST-EFFORT for real, which the deps contract promised and this did
    // not honour. The stamp is already committed, so letting a push failure
    // escape marked a delivered grant as a failed job — and the retry then
    // returned `already-delivered` without notifying, losing the notice anyway.
    // The seed is in the user's wallet either way; the wallet screen shows it.
    try {
      await deps.notify({ user_id, chain_id, amount_raw: grant.amount_raw, tx_ref })
    } catch (err) {
      deps.log.warn({ err, user_id, chain_id, tx_ref }, 'gas seed confirm: delivered but not announced')
    }
    return 'delivered'
  }

  if (status === 'failed') {
    // The CHAIN said so — a reverted receipt, or a signature carrying an error.
    // The money did not move, so the user is owed another attempt.
    await deps.seed.releaseGrant(user_id, chain_id)
    deps.log.warn({ user_id, chain_id, tx_ref }, 'gas seed confirm: chain reports failure, released')
    return 'failed'
  }

  // Still pending. Age is measured from when the transaction was RECORDED, not
  // from this attempt, so the bound is the same whether the job was retried
  // twice or two hundred times — and a redelivery long after the fact cannot
  // reset it.
  if (now().getTime() - submitted_at.getTime() > GAS_SEED_UNRESOLVED_AFTER_MS) {
    await deps.seed.markUnresolved(user_id, chain_id)
    deps.log.warn(
      { user_id, chain_id, tx_ref, submitted_at },
      'gas seed confirm: no answer within the window — marked unresolved for review',
    )
    return 'unresolved'
  }

  throw new RetryableError(`gas seed ${tx_ref} not confirmed yet`)
}
