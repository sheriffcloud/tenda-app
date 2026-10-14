/**
 * The CONFIRM job (features/gas-seed/claim/confirm) — #58.
 *
 * This is where a transfer's fate is decided, and the only place allowed to
 * decide it. Its predecessor made the same decision inside a `send()` call by
 * interpreting whether a wait had timed out, which is not evidence of anything;
 * two production money bugs came out of that reading.
 *
 * THE DISCIPLINE, and every test here is a face of it: `pending` is not
 * `failed`. A chain that has not answered gets asked again. Only an answer — a
 * reverted receipt, a signature carrying an error — frees a claimed slot, and
 * only a positive answer stamps one.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { GAS_SEED_UNRESOLVED_AFTER_MS } from '@tenda/shared'
import { RetryableError } from '@server/queue/jobs/verify-tx'
import {
  handleGasSeedConfirm,
  type GrantForJob,
  type GasSeedConfirmDeps,
  type GasSeedTransferStatus,
} from '@server/features/gas-seed'

const USER = 'u-1'
const CHAIN = 'eip155:16661'
const JOB = { user_id: USER, chain_id: CHAIN }
const AMOUNT = '10000000000000000'
const TX = '0xdeadbeef'
const NOW = new Date('2026-09-03T12:00:00.000Z')

/** A grant awaiting confirmation, broadcast `age_ms` before NOW. */
function submitted(age_ms = 1_000, over: Partial<GrantForJob> = {}): GrantForJob {
  return {
    status: 'submitted',
    tx_ref: TX,
    amount_raw: AMOUNT,
    wallet_address: '0xwallet',
    submitted_at: new Date(NOW.getTime() - age_ms),
    ...over,
  }
}

interface Recorder {
  delivered: number
  unresolved: number
  released: number
  notified: Array<{ tx_ref: string; amount_raw: string }>
  asked: Array<{ tx_ref: string; submitted_at: Date }>
  order: string[]
}

function makeDeps(opts: {
  grant?: GrantForJob | null
  status?: GasSeedTransferStatus
  checkThrows?: boolean
  noSender?: boolean
} = {}): { deps: GasSeedConfirmDeps; rec: Recorder } {
  const rec: Recorder = {
    delivered: 0,
    unresolved: 0,
    released: 0,
    notified: [],
    asked: [],
    order: [],
  }
  const deps: GasSeedConfirmDeps = {
    seed: {
      async markDelivered() {
        rec.order.push('markDelivered')
        rec.delivered += 1
      },
      async markUnresolved() {
        rec.order.push('markUnresolved')
        rec.unresolved += 1
      },
      async releaseGrant() {
        rec.order.push('release')
        rec.released += 1
      },
    },
    claim: {
      async findGrantForJob() {
        return opts.grant === undefined ? submitted() : opts.grant
      },
    },
    senders: opts.noSender === true
      ? new Map()
      : new Map([
          [
            CHAIN,
            {
              async sign() {
                assert.fail('the confirm job must never sign')
              },
              async checkStatus(args) {
                rec.order.push('checkStatus')
                rec.asked.push(args)
                if (opts.checkThrows ?? false) throw new Error('rpc unreachable')
                return opts.status ?? 'pending'
              },
            },
          ],
        ]),
    async notify(notice) {
      rec.order.push('notify')
      rec.notified.push({ tx_ref: notice.tx_ref, amount_raw: notice.amount_raw })
    },
    log: { info() {}, warn() {} },
    now: () => NOW,
  }
  return { deps, rec }
}

// ---------- the chain answered -----------------------------------------------

test('delivered: the grant is stamped, then the user is told', async () => {
  const { deps, rec } = makeDeps({ status: 'delivered' })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'delivered')
  assert.strictEqual(rec.delivered, 1)
  assert.deepStrictEqual(
    rec.order,
    ['checkStatus', 'markDelivered', 'notify'],
    'notifying before the stamp would promise gas a crash could un-record',
  )
  assert.deepStrictEqual(rec.notified, [{ tx_ref: TX, amount_raw: AMOUNT }])
})

test('a notification that FAILS does not un-deliver the grant', async () => {
  // The contract says best-effort, and it has to mean it: the stamp is already
  // committed when notify runs, so letting a push failure escape would mark a
  // delivered grant as a failed job — and the retry would then see
  // `already-delivered` and skip the notice anyway, losing it for nothing.
  const { deps, rec } = makeDeps({ status: 'delivered' })
  deps.notify = async () => {
    throw new Error('push provider down')
  }
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'delivered')
  assert.strictEqual(rec.delivered, 1, 'the grant is delivered regardless of the announcement')
})

test('failed: the slot is RELEASED, because the chain says no money moved', async () => {
  // The user received nothing, so they are owed another attempt. This is the
  // only release the confirm job may perform, and it rests on a chain answer.
  const { deps, rec } = makeDeps({ status: 'failed' })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'failed')
  assert.strictEqual(rec.released, 1)
  assert.strictEqual(rec.delivered, 0)
  assert.deepStrictEqual(rec.notified, [], 'nothing landed, so nothing to announce')
})

// ---------- the chain has not answered ---------------------------------------

test('pending inside the window: RetryableError, and NOTHING is written', async () => {
  // The core discipline. No answer is not an answer — the row is left exactly
  // as it was and BullMQ's backoff does the waiting.
  const { deps, rec } = makeDeps({ status: 'pending' })
  await assert.rejects(() => handleGasSeedConfirm(deps, JOB), RetryableError)
  assert.deepStrictEqual(rec.order, ['checkStatus'])
  assert.strictEqual(rec.released, 0, 'a pending transfer must never free its slot')
  assert.strictEqual(rec.delivered, 0)
  assert.strictEqual(rec.unresolved, 0)
})

test('pending PAST the window: marked unresolved, and the slot is still held', async () => {
  // Terminal-unknown, not terminal-failed. The money may have moved, so the slot
  // stays taken and a person settles it — releasing here would risk a second
  // payment, and stamping it would claim a delivery nobody observed.
  const { deps, rec } = makeDeps({ status: 'pending', grant: submitted(GAS_SEED_UNRESOLVED_AFTER_MS + 1) })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'unresolved')
  assert.strictEqual(rec.unresolved, 1)
  assert.strictEqual(rec.released, 0, 'unresolved must NOT free the slot')
  assert.strictEqual(rec.delivered, 0, 'unresolved must NOT claim a delivery')
})

test('the window boundary is exclusive — exactly at the bound still retries', async () => {
  const { deps } = makeDeps({ status: 'pending', grant: submitted(GAS_SEED_UNRESOLVED_AFTER_MS) })
  await assert.rejects(() => handleGasSeedConfirm(deps, JOB), RetryableError)
})

test('the age is measured from submitted_at, not from this attempt', async () => {
  // A redelivery hours later must not reset the clock, and an early retry must
  // not shorten it. The bound belongs to the transfer, not to the job.
  const { deps, rec } = makeDeps({ status: 'pending' })
  await assert.rejects(() => handleGasSeedConfirm(deps, JOB), RetryableError)
  assert.deepStrictEqual(rec.asked, [{ tx_ref: TX, submitted_at: submitted().submitted_at }])
})

test('a delivered answer past the window still delivers — age never overrides an answer', async () => {
  // Order matters inside the handler: the chain's answer is consulted BEFORE the
  // give-up clock. A transfer that finally mined after eight hours is delivered,
  // not unresolved.
  const { deps, rec } = makeDeps({
    status: 'delivered',
    grant: submitted(GAS_SEED_UNRESOLVED_AFTER_MS * 2),
  })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'delivered')
  assert.strictEqual(rec.unresolved, 0)
})

// ---------- states that are not this job's business --------------------------

test('a CLAIMED grant is not confirmed — nothing was ever signed', async () => {
  const { deps, rec } = makeDeps({ grant: { ...submitted(), status: 'claimed', tx_ref: null, submitted_at: null } })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'not-submitted')
  assert.deepStrictEqual(rec.order, [], 'there is no transaction to ask about')
})

test('an UNRESOLVED grant is left alone — a person owns it now', async () => {
  // Re-opening it automatically would undo a decision deliberately handed to a
  // human, and could re-enter the retry loop forever.
  const { deps, rec } = makeDeps({ grant: submitted(0, { status: 'unresolved' }) })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'not-submitted')
  assert.deepStrictEqual(rec.order, [])
})

test('an already-delivered grant is a no-op, not a second notification', async () => {
  const { deps, rec } = makeDeps({ grant: submitted(0, { status: 'delivered' }) })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'already-delivered')
  assert.deepStrictEqual(rec.notified, [])
})

test('a released grant confirms nothing', async () => {
  const { deps, rec } = makeDeps({ grant: null })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'no-claim')
  assert.deepStrictEqual(rec.order, [])
})

test('a submitted grant with no reference is refused rather than dereferenced', async () => {
  // Unreachable through the code — `markSubmitted` writes both together — but
  // the columns are independently nullable, so a hand-repaired row can contradict
  // that. It must report, not crash a worker.
  const { deps } = makeDeps({ grant: submitted(0, { tx_ref: null }) })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'not-submitted')
})

// ---------- the chain cannot be reached --------------------------------------

test('a chain whose key was pulled is treated as PENDING, not as an outcome', async () => {
  // "Cannot check" is not "did not happen". It retries — the key may come back —
  // and the slot is untouched meanwhile.
  const { deps, rec } = makeDeps({ noSender: true })
  await assert.rejects(() => handleGasSeedConfirm(deps, JOB), RetryableError)
  assert.strictEqual(rec.released, 0)
  assert.strictEqual(rec.unresolved, 0)
  assert.strictEqual(rec.delivered, 0)
})

test('an uncheckable chain STILL ages into unresolved rather than sitting forever', async () => {
  // The bug an early `sender-missing` return would have left: with no sender
  // there is nothing to resolve the grant, so returning cleanly marked the job
  // done and the row stayed `submitted` with nothing in the system that would
  // ever move it again — invisible to the give-up window that exists for
  // exactly this.
  const { deps, rec } = makeDeps({
    noSender: true,
    grant: submitted(GAS_SEED_UNRESOLVED_AFTER_MS + 1),
  })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'unresolved')
  assert.strictEqual(rec.unresolved, 1)
  assert.strictEqual(rec.released, 0)
})

test('a checkStatus that THROWS is PENDING, not an outcome — and still retries', async () => {
  // An RPC failure says nothing about the money, so it must not touch the slot.
  // It retries like any other unanswered transfer.
  const { deps, rec } = makeDeps({ checkThrows: true })
  await assert.rejects(() => handleGasSeedConfirm(deps, JOB), RetryableError)
  assert.strictEqual(rec.released, 0)
  assert.strictEqual(rec.delivered, 0)
  assert.strictEqual(rec.unresolved, 0)
})

test('a chain that keeps THROWING still ages into unresolved', async () => {
  // The dead end this replaced. Letting the read escape skipped the give-up
  // window entirely, so a persistently failing RPC burned the job's retries and
  // left the grant `submitted` with nothing remaining to move it — permanently,
  // because the job is gone even once the chain recovers.
  const { deps, rec } = makeDeps({
    checkThrows: true,
    grant: submitted(GAS_SEED_UNRESOLVED_AFTER_MS + 1),
  })
  assert.strictEqual(await handleGasSeedConfirm(deps, JOB), 'unresolved')
  assert.strictEqual(rec.unresolved, 1)
  assert.strictEqual(rec.released, 0, 'an unreadable chain must never free the slot')
})

test('an unreadable chain is LOGGED, so folding it to pending costs no diagnostic', async () => {
  // The one thing propagation was good for. Swallowing the error silently would
  // trade a permanent grant for an invisible outage.
  const warned: string[] = []
  const { deps } = makeDeps({ checkThrows: true })
  deps.log = { info() {}, warn: (_o, msg) => warned.push(msg) }
  await assert.rejects(() => handleGasSeedConfirm(deps, JOB), RetryableError)
  assert.ok(
    warned.some((m) => m.includes('chain unreadable')),
    `the failure must be logged, saw ${JSON.stringify(warned)}`,
  )
})
