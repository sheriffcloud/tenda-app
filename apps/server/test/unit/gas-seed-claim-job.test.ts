/**
 * The BROADCAST job (features/gas-seed/claim/job) — #58.
 *
 * WHAT THIS FILE IS REALLY GUARDING is an ORDER, not a set of return values:
 * sign, then record, then broadcast. Every assertion below exists because some
 * other order loses money.
 *
 *   record before sign   → a reference for a transaction that does not exist.
 *   broadcast before record → a crash in the gap leaves money gone and nothing
 *                             in the database pointing at it.
 *   release after broadcast → the transfer lands anyway and the user, already
 *                             paid, claims a second time. This is the drain that
 *                             was measured on devnet.
 *
 * It also absorbs the idempotency cases that used to belong to `dispatchGasSeeds`
 * (deleted with #58, it had been dead since #53c-2): a redelivered job must
 * never put a second transfer on the chain for one grant.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  handleGasSeedClaim,
  type GrantForJob,
  type GasSeedJobDeps,
  type GasSeedSender,
} from '@server/features/gas-seed'

const USER = 'u-1'
const CHAIN = 'eip155:16661'
const JOB = { user_id: USER, chain_id: CHAIN }
const AMOUNT = '10000000000000000'
const TX = '0xdeadbeef'

function grant(over: Partial<GrantForJob> = {}): GrantForJob {
  return {
    status: 'claimed',
    tx_ref: null,
    amount_raw: AMOUNT,
    wallet_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    submitted_at: null,
    ...over,
  }
}

interface Recorder {
  calls: string[]
  submitted: Array<{ tx_ref: string; submitted_at: Date }>
  released: number
  confirmsQueued: number
}

function makeDeps(opts: {
  grant?: GrantForJob | null
  signFails?: boolean
  broadcastFails?: boolean
  recordRefused?: boolean
  noSender?: boolean
  balance?: bigint | null
  enqueueFails?: boolean
} = {}): { deps: GasSeedJobDeps; rec: Recorder } {
  const rec: Recorder = { calls: [], submitted: [], released: 0, confirmsQueued: 0 }
  const sender: GasSeedSender = {
    async sign() {
      rec.calls.push('sign')
      if (opts.signFails ?? false) throw new Error('nonce fetch failed')
      return {
        tx_ref: TX,
        async broadcast() {
          rec.calls.push('broadcast')
          if (opts.broadcastFails ?? false) throw new Error('connection reset')
        },
      }
    },
    async checkStatus() {
      assert.fail('the broadcast job must never confirm — that is the confirm job')
    },
  }
  const deps: GasSeedJobDeps = {
    seed: {
      async markSubmitted({ tx_ref, submitted_at }) {
        rec.calls.push('markSubmitted')
        if (opts.recordRefused ?? false) return false
        rec.submitted.push({ tx_ref, submitted_at })
        return true
      },
      async releaseGrant() {
        rec.calls.push('release')
        rec.released += 1
      },
    },
    claim: {
      async findGrantForJob() {
        return opts.grant === undefined ? grant() : opts.grant
      },
    },
    senders: opts.noSender === true ? new Map() : new Map([[CHAIN, sender]]),
    funders:
      opts.balance === null
        ? new Map()
        : new Map([
            [
              CHAIN,
              {
                address: 'funder',
                balance: async () => {
                  rec.calls.push('balance')
                  return opts.balance ?? BigInt(AMOUNT)
                },
              },
            ],
          ]),
    async enqueueConfirm() {
      rec.calls.push('enqueueConfirm')
      if (opts.enqueueFails ?? false) throw new Error('redis down')
      rec.confirmsQueued += 1
    },
    log: { info() {}, warn() {} },
  }
  return { deps, rec }
}

// ---------- the order --------------------------------------------------------

test('THE ORDER: balance, sign, record, broadcast, then queue the confirmation', async () => {
  // The single most important assertion in the feature. `markSubmitted` sits
  // between `sign` and `broadcast`, which is what makes a crash at any point
  // leave a transaction that can still be attributed to its grant.
  const { deps, rec } = makeDeps()
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'submitted')
  assert.deepStrictEqual(rec.calls, [
    'balance',
    'sign',
    'markSubmitted',
    'broadcast',
    'enqueueConfirm',
  ])
})

test('the recorded reference is the one that was signed', async () => {
  const { deps, rec } = makeDeps()
  await handleGasSeedClaim(deps, JOB)
  assert.strictEqual(rec.submitted[0]?.tx_ref, TX)
})

test('submitted_at is stamped from the injected clock, not left to the DB', async () => {
  // The confirm job measures its give-up window from this value, so it has to
  // be a real instant recorded here rather than a default filled in later.
  const fixed = new Date('2026-09-03T04:00:00.000Z')
  const { deps, rec } = makeDeps()
  deps.now = () => fixed
  await handleGasSeedClaim(deps, JOB)
  assert.deepStrictEqual(rec.submitted[0]?.submitted_at, fixed)
})

// ---------- releasing is only ever safe BEFORE a signature -------------------

test('signing failure releases the slot — nothing can have moved', async () => {
  const { deps, rec } = makeDeps({ signFails: true })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'sign-failed')
  assert.strictEqual(rec.released, 1)
  assert.deepStrictEqual(rec.calls, ['balance', 'sign', 'release'])
})

test('a BROADCAST failure does NOT release — it is ambiguous, and confirm settles it', async () => {
  // THE DRAIN, inverted into a guard. The node may have accepted the transaction
  // and then dropped the connection; releasing on a maybe is exactly how a user
  // gets paid twice. The slot stays and the confirmation is queued.
  const { deps, rec } = makeDeps({ broadcastFails: true })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'broadcast-uncertain')
  assert.strictEqual(rec.released, 0, 'a slot whose transfer may have landed must never be freed')
  assert.strictEqual(rec.confirmsQueued, 1, 'the chain has to be asked about it')
})

test('an empty hot wallet releases BEFORE signing, so nothing is left unresolvable', async () => {
  // An empty funder is an ordinary operational state and makes the node refuse
  // the broadcast. Caught here it is a released slot the user can reclaim;
  // caught after signing it would be a recorded transaction that can never land,
  // which on EVM nothing can resolve automatically.
  const { deps, rec } = makeDeps({ balance: 1n })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'funder-empty')
  assert.strictEqual(rec.released, 1)
  assert.deepStrictEqual(rec.calls, ['balance', 'release'], 'it must not have signed')
})

test('a funder that can EXACTLY cover the grant is allowed to pay it', async () => {
  // Boundary: `>=`, not `>`. A wallet holding precisely one grant must not be
  // refused, or the last seed a topped-up wallet can pay is never paid.
  const { deps } = makeDeps({ balance: BigInt(AMOUNT) })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'submitted')
})

test('an UNREADABLE balance does not block the claim', async () => {
  // Refusing to pay because a read failed would strand users over a transient
  // RPC outage. The broadcast is allowed to be the judge instead.
  const { deps, rec } = makeDeps()
  deps.funders = new Map([
    [CHAIN, { address: 'f', balance: async () => { throw new Error('rpc down') } }],
  ])
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'submitted')
  assert.strictEqual(rec.released, 0)
})

// ---------- redelivery: never a second transfer ------------------------------

test('a redelivered job for a SUBMITTED grant re-queues confirmation, never re-signs', async () => {
  // Two transfers for one grant is the double-pay the whole ordering prevents.
  // Re-queueing is right rather than doing nothing: the previous attempt may
  // have died before it managed to.
  const { deps, rec } = makeDeps({ grant: grant({ status: 'submitted', tx_ref: TX }) })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'already-submitted')
  assert.deepStrictEqual(rec.calls, ['enqueueConfirm'])
})

test('a redelivered job for a DELIVERED grant does nothing at all', async () => {
  const { deps, rec } = makeDeps({ grant: grant({ status: 'delivered', tx_ref: TX }) })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'already-delivered')
  assert.deepStrictEqual(rec.calls, [])
})

test('losing the record race abandons OUR signed transfer rather than broadcasting it', async () => {
  // `markSubmitted` is status-guarded, so a concurrent attempt that recorded
  // first wins. Broadcasting ours anyway would put a second transfer on the
  // chain for one grant — the guard is worthless if its answer is ignored.
  const { deps, rec } = makeDeps({ recordRefused: true })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'already-submitted')
  assert.ok(!rec.calls.includes('broadcast'), 'the losing attempt must not broadcast')
  assert.strictEqual(rec.released, 0, 'the winner’s slot must not be released')
})

// ---------- the world changed after the claim --------------------------------

test('no grant to pay: nothing happens', async () => {
  const { deps, rec } = makeDeps({ grant: null })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'no-claim')
  assert.deepStrictEqual(rec.calls, [])
})

test('a claim whose wallet was unlinked is released', async () => {
  const { deps, rec } = makeDeps({ grant: grant({ wallet_address: null }) })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'no-wallet')
  assert.strictEqual(rec.released, 1)
})

test('a chain whose sender key was pulled is released', async () => {
  const { deps, rec } = makeDeps({ noSender: true })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'sender-missing')
  assert.strictEqual(rec.released, 1)
})

// ---------- the queue is not what makes it safe ------------------------------

test('a broadcast whose confirmation cannot be queued THROWS, so it is retried', async () => {
  // The dead end this exists for. The money is on its way and the row records
  // it, so releasing would be unforgivable — but returning quietly would leave a
  // grant nothing ever asks the chain about: it sits `submitted`, no confirm job
  // exists, and `unresolved` is unreachable because only the confirm job sets
  // it. Throwing hands it back to BullMQ, whose redelivery re-queues the
  // confirmation without signing a second transfer.
  const { deps, rec } = makeDeps({ enqueueFails: true })
  await assert.rejects(() => handleGasSeedClaim(deps, JOB), /redis down/)
  assert.strictEqual(rec.released, 0, 'a broadcast transfer must never free its slot')
  assert.ok(rec.calls.includes('broadcast'), 'it did broadcast before the enqueue failed')
})

test('a REDELIVERY after that failure re-queues the confirmation and signs nothing', async () => {
  // The other half of the retry being safe. Without this, throwing above would
  // just move the problem: the point is that the second attempt finds the grant
  // already `submitted` and does the one missing thing.
  const { deps, rec } = makeDeps({ grant: grant({ status: 'submitted', tx_ref: TX }) })
  assert.strictEqual(await handleGasSeedClaim(deps, JOB), 'already-submitted')
  assert.strictEqual(rec.confirmsQueued, 1)
  assert.ok(!rec.calls.includes('sign'), 'a redelivery must never sign a second transfer')
})

test('the job never throws for anything a retry cannot fix', async () => {
  // Everything except the enqueue failure above: either the slot is gone or a
  // transaction is already recorded, and in both cases a retry would achieve
  // nothing. Retrying an unconfirmed transfer belongs to the confirm job, which
  // retries against the chain instead of the wallet.
  for (const opts of [
    { signFails: true },
    { broadcastFails: true },
    { noSender: true },
    { grant: null },
  ]) {
    const { deps } = makeDeps(opts)
    await assert.doesNotReject(() => handleGasSeedClaim(deps, JOB))
  }
})
