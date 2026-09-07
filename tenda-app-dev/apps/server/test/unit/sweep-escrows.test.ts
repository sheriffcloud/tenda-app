/**
 * The abandoned-escrow sweeper's decisions (#43), with the chain and the store
 * faked so each one is observable on its own.
 *
 * The property under test is not "it calls the contract" — it is WHO the money
 * reaches and WHO it never can. The contract half of that guarantee lives in
 * `contracts/evm/test/TendaEscrow.t.sol` (refundExpired pays `e.creator`, never
 * `msg.sender`); this file guards the server half: the sweeper attributes the
 * transaction to the creator, targets the escrow's own pinned contract, and
 * cannot be talked into sweeping a chain that has no sweep port.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChainAdapter, ChainRegistry, SweepArgs } from '@server/chains/types'
import type { SweepableEscrow, SweepEscrowsStore } from '@server/jobs/sweep-escrows'
import { handleSweepEscrows, SWEEP_BATCH_LIMIT, SWEEP_FIRST_REFUSAL_MS } from '@server/jobs/sweep-escrows'
import type { TxAttemptRow } from '@server/lib/tx-attempts'
import type { VerifyTxJobPayload } from '@server/jobs/verify-tx'
import type { JobName, JobPayload } from '@server/plugins/queue'
import { REPEATABLES } from '@server/plugins/workers'

const CHAIN = 'eip155:84532'
const CONTRACT = '0x00000000000000000000000000000000000000c1'

function row(over: Partial<SweepableEscrow> = {}): SweepableEscrow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    creator_id: '22222222-2222-4222-8222-222222222222',
    chain_id: CHAIN,
    escrow_contract: CONTRACT,
    transition: 'refund_expired',
    ...over,
  }
}

interface EnqueuedJob {
  name: JobName
  payload: JobPayload[JobName]
}

/**
 * Narrow a captured job to the one whose payload this file asserts on. A
 * predicate rather than a cast: it is the queue's OWN discriminant, so if
 * `verify-tx` were renamed or its payload reshaped this stops compiling
 * instead of silently reading a field nothing sends any more.
 */
function isVerifyTxJob(job: EnqueuedJob): job is { name: 'verify-tx'; payload: VerifyTxJobPayload } {
  return job.name === 'verify-tx'
}

interface Harness {
  result: Promise<{ scanned: number; swept: number; skipped: number }>
  swept: SweepArgs[]
  attempts: TxAttemptRow[]
  enqueued: EnqueuedJob[]
  warnings: Record<string, unknown>[]
  findArgs: { now: Date; delay_ms: number; grace_period_seconds: number; limit: number }[]
}

/**
 * @param sweepImpl absent = the chain offers NO sweep port (Solana until #42).
 */
function run(rows: SweepableEscrow[], sweepImpl?: (a: SweepArgs) => Promise<{ tx_ref: string }>): Harness {
  const swept: SweepArgs[] = []
  const attempts: TxAttemptRow[] = []
  const enqueued: EnqueuedJob[] = []
  const warnings: Record<string, unknown>[] = []
  const findArgs: Harness['findArgs'] = []

  // Fully typed rather than cast: `jobs/reconcile-escrows`' test builds its
  // registry the same way, and a cast fake would keep compiling — and keep
  // passing — against a ChainAdapter the production adapters no longer have.
  const adapter: ChainAdapter = {
    namespace: 'eip155',
    chain_id: CHAIN,
    escrowAddress: CONTRACT,
    async buildTx() {
      throw new Error('the sweeper builds nothing itself')
    },
    async verifyTx() {
      throw new Error('verification is the verify-tx job, reached via the queue')
    },
    async verifyAuthSig() {
      return true
    },
    async fetchEscrowState() {
      return null
    },
    computeFee() {
      return '0'
    },
    ...(sweepImpl !== undefined
      ? {
          sweep: {
            sweeper_address: '0xsweeper',
            sweep: (a: SweepArgs) => {
              swept.push(a)
              return sweepImpl(a)
            },
          },
        }
      : {}),
  }

  const store: SweepEscrowsStore = {
    async findSweepable(args) {
      findArgs.push(args)
      return rows
    },
  }

  const result = handleSweepEscrows(
    {
      store,
      chains: {
        has: (id: string) => id === CHAIN,
        get: (id: string) => {
          // Mirrors buildChainRegistry: an unregistered id is an error, not an
          // undefined. A fake that answered `adapter` here would hide the very
          // guard the unprovisioned-chain test exists to prove.
          if (id !== CHAIN) throw new Error(`no adapter for ${id}`)
          return adapter
        },
        list: () => [adapter],
        verifyAuthSig: async () => true, // not exercised by the sweeper
      } satisfies ChainRegistry,
      attempts: {
        store: {
          async insertAttempt(r) {
            attempts.push(r)
            return true
          },
        },
        queue: {
          async enqueue(name, payload, opts) {
            enqueued.push({ name, payload })
            return { job_id: opts?.job_id ?? name }
          },
        },
        log: { warn: (obj: Record<string, unknown>) => warnings.push(obj) },
      },
      log: {
        info: () => {},
        warn: (obj: Record<string, unknown>) => warnings.push(obj),
      },
      now: () => new Date('2026-08-30T12:00:00.000Z'),
      grace_period_seconds: 3600,
    },
    { tick_id: 't1' },
  )

  return { result, swept, attempts, enqueued, warnings, findArgs }
}

test('an eligible escrow is swept against its OWN pinned contract', async () => {
  // #89: an escrow funded before a redeploy lives in the old contract. Sweeping
  // it at the chain's CURRENT address would call a contract that has never
  // heard of this escrow id.
  const h = run([row()], async () => ({ tx_ref: '0xdead' }))
  const res = await h.result

  assert.deepEqual(res, { scanned: 1, swept: 1, skipped: 0 })
  assert.equal(h.swept.length, 1)
  assert.equal(h.swept[0].escrow_contract, CONTRACT)
  assert.equal(h.swept[0].transition, 'refund_expired')
})

test('the attempt is recorded against the CREATOR, and declares it was a sweep', async () => {
  // The refund is the creator's, so the audit row is theirs — and the verify-tx
  // telemetry must not claim a client ping that never happened.
  const h = run([row()], async () => ({ tx_ref: '0xdead' }))
  await h.result

  assert.equal(h.attempts.length, 1)
  assert.equal(h.attempts[0].user_id, '22222222-2222-4222-8222-222222222222')
  assert.equal(h.attempts[0].escrow_id, '11111111-1111-4111-8111-111111111111')
  assert.equal(h.attempts[0].action, 'refund_expired')
  assert.equal(h.attempts[0].tx_ref, '0xdead')

  const verify = h.enqueued.find(isVerifyTxJob)
  assert.ok(verify, 'verification is enqueued, exactly as a user-submitted refund would be')
  assert.equal(verify.payload.source, 'sweep')
})

test('an accepted-but-undelivered escrow sweeps via reclaim_abandoned', async () => {
  const h = run([row({ transition: 'reclaim_abandoned' })], async () => ({ tx_ref: '0xbeef' }))
  await h.result

  assert.equal(h.swept[0].transition, 'reclaim_abandoned')
  assert.equal(h.attempts[0].action, 'reclaim_abandoned')
})

test('a chain with no sweep port is skipped, not attempted', async () => {
  // Solana until #42, and any chain without a relayer float. The row is counted
  // as skipped rather than swallowed, so the log tells the truth about a
  // backlog that this deployment can never drain.
  const h = run([row()]) // no sweep impl
  const res = await h.result

  assert.deepEqual(res, { scanned: 1, swept: 0, skipped: 1 })
  assert.equal(h.attempts.length, 0, 'nothing is recorded for a transaction never sent')
  // Skipped CLEANLY — not by falling into the error path. Every Solana escrow
  // is in this state on every tick forever, so a warning here would be a
  // permanent log flood that buries the failures worth reading. The counts
  // alone cannot tell the two apart, which is why this asserts the silence.
  assert.deepEqual(h.warnings, [], 'a chain that simply cannot sweep is not an error')
})

test('an escrow on a chain this deployment does not have is skipped, not attempted', async () => {
  // Not the same case as "no sweep port": here the registry has never heard of
  // the chain at all. Real whenever a deployment drops a chain from its env
  // while rows for it remain, or when Solana rows reach an EVM-only server.
  // `chains.get` would THROW on an unregistered id, so without the `has` guard
  // this lands in the catch and is reported as a sweep failure — a warning per
  // row, per tick, forever, for escrows that were never this server's to move.
  const h = run([row({ chain_id: 'solana:devnet' })], async () => ({ tx_ref: '0xdead' }))
  const res = await h.result

  assert.deepEqual(res, { scanned: 1, swept: 0, skipped: 1 })
  assert.equal(h.swept.length, 0, 'no sweep is attempted on a chain we cannot reach')
  assert.equal(h.attempts.length, 0)
  assert.deepEqual(h.warnings, [], 'an unprovisioned chain is a skip, not an error')
})

test('one escrow reverting does not take the tick down', async () => {
  // Ordinary: the creator raced us with their own refund, or the escrow is held
  // by a contract generation that predates #43 and still demands them. The
  // simulation throws, and the REST of the batch must still be swept.
  const bad = row({ id: '33333333-3333-4333-8333-333333333333' })
  const good = row()
  const h = run([bad, good], async (a) => {
    if (a.escrow_id === bad.id) throw new Error('execution reverted: NotCreator()')
    return { tx_ref: '0xgood' }
  })
  const res = await h.result

  assert.deepEqual(res, { scanned: 2, swept: 1, skipped: 1 })
  assert.equal(h.attempts.length, 1)
  assert.equal(h.attempts[0].escrow_id, good.id)
  assert.ok(
    h.warnings.some((w) => w.escrow_id === bad.id),
    'the failure is reported, not swallowed',
  )
})

test('the scan is asked for the first-refusal delay and the batch cap', async () => {
  // The creator is notified the moment their window closes; spending platform
  // gas before they have had a chance to spend their own would be both rude and
  // wasteful. The delay is that promise, and it is the store's input.
  const h = run([], async () => ({ tx_ref: '0x' }))
  await h.result

  assert.equal(h.findArgs.length, 1)
  assert.equal(h.findArgs[0].delay_ms, SWEEP_FIRST_REFUSAL_MS)
  assert.equal(h.findArgs[0].limit, SWEEP_BATCH_LIMIT)
  assert.equal(h.findArgs[0].grace_period_seconds, 3600)
})

test('the first-refusal delay outlasts the notice that precedes it', () => {
  // The creator must hear that their window closed BEFORE the platform spends
  // its own gas refunding them, or the first they know of it is money moving.
  // Read off the live schedule rather than restating the notice's cadence:
  // a hardcoded 60_000 here would keep passing if `expire-escrows` were slowed
  // to a day, which is precisely the case that would break the ordering.
  const notice = REPEATABLES.find((r) => r.name === 'expire-escrows')
  assert.ok(notice, 'the notice this delay defers to must still be scheduled')
  assert.ok(
    SWEEP_FIRST_REFUSAL_MS > notice.every_ms,
    `sweeping after ${SWEEP_FIRST_REFUSAL_MS}ms would overtake a notice every ${notice.every_ms}ms`,
  )
})
