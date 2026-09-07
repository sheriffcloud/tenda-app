/**
 * jobs/reconcile-escrows — the safety-net sweep: probe → enqueue / timeout /
 * leave-pending, with RPC failures and queue failures both non-fatal.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  RECONCILE_BATCH_LIMIT,
  RECONCILE_GIVE_UP_MS,
  RECONCILE_MIN_AGE_MS,
  RECONCILE_TIMEOUT_CODE,
  reconcileEscrowsHandler,
  type PendingAttempt,
  type ReconcileDeps,
} from '@server/jobs/reconcile-escrows'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'
import type { ChainAdapter, ChainRegistry } from '@server/chains/types'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { evmAdapter } from '@server/chains/evm'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { TEST_ESCROW_PROGRAM } from '../helpers/fixtures'

const NOW = new Date('2026-06-04T12:00:00Z')
const WINDOW = { from_iso: '2026-06-04T11:00:00Z', to_iso: '2026-06-04T12:00:00Z' }

function attempt(over: Partial<PendingAttempt> = {}): PendingAttempt {
  return {
    tx_ref: 'sig-1',
    action: 'accept',
    escrow_id: 'e-1',
    chain_id: 'solana:devnet',
    submitted_at: new Date(NOW.getTime() - RECONCILE_MIN_AGE_MS - 60_000),
    ...over,
  }
}

function makeDeps(opts: {
  pending: PendingAttempt[]
  confirmed?: boolean
  probeThrows?: boolean
  enqueueThrows?: boolean
}): {
  deps: ReconcileDeps
  calls: { enqueued: Array<{ job_id?: string }>; failed: Array<{ tx_ref: string; code: string }>; queried: Date[] }
} {
  const calls = {
    enqueued: [] as Array<{ job_id?: string }>,
    failed: [] as Array<{ tx_ref: string; code: string }>,
    queried: [] as Date[],
  }
  const adapter: ChainAdapter = {
    namespace: 'solana',
    chain_id: 'solana:devnet',
    escrowAddress: 'FakeProgram1111111111111111111111111111111',
    async buildTx() {
      throw new Error('not used')
    },
    async verifyTx() {
      if (opts.probeThrows ?? false) throw new Error('rpc down')
      return (opts.confirmed ?? true)
        ? {
            confirmed: true,
            failed: false,
            event: {
              name: 'EscrowAccepted',
              escrow_ref: 'x',
              contract: TEST_ESCROW_PROGRAM,
              fields: {},
            },
          }
        : { confirmed: false }
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
  }
  const chains: ChainRegistry = {
    get: () => adapter,
    has: () => true,
    list: () => [adapter],
    verifyAuthSig: async () => true, // not exercised by reconcile; satisfies ChainRegistry
  }
  const deps: ReconcileDeps = {
    store: {
      async findPendingAttempts(olderThan) {
        calls.queried.push(olderThan)
        return opts.pending
      },
      async markAttemptFailed(tx_ref, code) {
        calls.failed.push({ tx_ref, code })
      },
    },
    chains,
    queue: {
      async enqueue(_name, _payload, o) {
        if (opts.enqueueThrows ?? false) throw new Error('redis down')
        calls.enqueued.push({ job_id: o?.job_id })
        return { job_id: o?.job_id ?? 'x' }
      },
    },
    log: { info() {}, warn() {} },
    now: () => NOW,
  }
  return { deps, calls }
}

test('queries with the probe-delay cutoff', async () => {
  const { deps, calls } = makeDeps({ pending: [] })
  await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(calls.queried[0].getTime(), NOW.getTime() - RECONCILE_MIN_AGE_MS)
})

test('confirmed attempt → verify-tx enqueued with the canonical dedup job_id', async () => {
  const { deps, calls } = makeDeps({ pending: [attempt()], confirmed: true })
  const r = await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(r.enqueued, 1)
  assert.strictEqual(
    calls.enqueued[0].job_id,
    verifyTxDedupKey({ chain_id: 'solana:devnet', tx_ref: 'sig-1', event: 'EscrowAccepted' }),
  )
})

test('unknown + young → still pending; unknown + past horizon → TIMEOUT', async () => {
  const young = attempt({ tx_ref: 'young' })
  const old = attempt({
    tx_ref: 'old',
    submitted_at: new Date(NOW.getTime() - RECONCILE_GIVE_UP_MS - 1),
  })
  const { deps, calls } = makeDeps({ pending: [young, old], confirmed: false })
  const r = await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(r.still_pending, 1)
  assert.strictEqual(r.timed_out, 1)
  assert.deepStrictEqual(calls.failed, [{ tx_ref: 'old', code: RECONCILE_TIMEOUT_CODE }])
})

test('probe RPC failure leaves the row pending (next tick retries)', async () => {
  const { deps, calls } = makeDeps({ pending: [attempt()], probeThrows: true })
  const r = await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(r.still_pending, 1)
  assert.strictEqual(calls.failed.length, 0)
})

test('enqueue failure leaves the row pending, never throws', async () => {
  const { deps } = makeDeps({ pending: [attempt()], confirmed: true, enqueueThrows: true })
  const r = await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(r.enqueued, 0)
  assert.strictEqual(r.still_pending, 1)
})

test('attempt without escrow falls back to the registered chain', async () => {
  const { deps, calls } = makeDeps({
    pending: [attempt({ escrow_id: null, chain_id: null })],
    confirmed: true,
  })
  const r = await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(r.enqueued, 1)
  // ':' is sanitised out of the dedup key (BullMQ jobId constraint)
  assert.match(calls.enqueued[0].job_id ?? '', /solana\.devnet/)
})

test('full batch logs the overflow (no silent cap)', async () => {
  const pending = Array.from({ length: RECONCILE_BATCH_LIMIT }, (_, i) =>
    attempt({ tx_ref: `sig-${i}` }),
  )
  const { deps } = makeDeps({ pending, confirmed: true })
  const r = await reconcileEscrowsHandler(deps, WINDOW)
  assert.strictEqual(r.scanned, RECONCILE_BATCH_LIMIT)
})

// ---------- contract generations (open_issues #89, correction C1) ------------

/**
 * #89 recorded that reconcile "works from `tx_ref` via `getTransactionStatus`,
 * which is contract-agnostic", and therefore was unaffected by a redeploy.
 * Both halves were wrong: `getTransactionStatus` is declared on `RpcProvider`
 * and has NO implementation and NO caller, while `reconcileEscrowsHandler`
 * probes through `adapter.verifyTx`, which IS contract-scoped.
 *
 * So reconcile is not neutral — it is the path that repeatedly re-probes an
 * old-contract attempt. These run the REAL EVM adapter under it (stubbed RPC,
 * real decoder) so the seam is exercised rather than asserted about a stub.
 */

const OLD_CONTRACT = '0x00000000000000000000000000000000000000aa' as const
const NEW_CONTRACT = '0x00000000000000000000000000000000000000bb' as const
const RECONCILE_UUID = '11111111-2222-4333-8444-555555555555'

function acceptedReceiptLog(address: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowAccepted',
    args: {
      escrowId: `0x${RECONCILE_UUID.replace(/-/g, '')}` as `0x${string}`,
      counterparty: '0x1111111111111111111111111111111111111111',
    },
  })
  return {
    address,
    topics: [...topics] as `0x${string}`[],
    data: encodeAbiParameters([{ type: 'uint64' }], [1_900_007_200n]),
  }
}

/** Reconcile wired to a REAL evm adapter whose node returns an OLD-contract tx. */
function evmReconcile(known: readonly string[]) {
  const failed: Array<{ tx_ref: string; code: string }> = []
  const enqueued: string[] = []
  const adapter = evmAdapter({
    chain_id: 'eip155:84532',
    rpc_url: 'http://unused.invalid',
    escrow_contract: NEW_CONTRACT,
    escrow_contracts: known,
    min_confirmations: 0,
    deps: {
      resolveWalletAddress: async () => '0x0000000000000000000000000000000000000001',
      resolveAsset: async () => ({ token_address: null }),
      rpc: {
        async getTransactionReceipt() {
          return { block_number: 10n, status: 'success' as const, logs: [acceptedReceiptLog(OLD_CONTRACT)] }
        },
        async getBlockNumber() {
          return 20n
        },
        async getLogRefs() {
          return []
        },
        async readEscrow() {
          return null
        },
        async readPermitFacts() {
          throw new Error('not used')
        },
      },
    },
  })
  const chains: ChainRegistry = {
    get: () => adapter,
    has: () => true,
    list: () => [adapter],
    verifyAuthSig: async () => true,
  }
  const deps: ReconcileDeps = {
    store: {
      async findPendingAttempts() {
        return [
          {
            tx_ref: `0x${'ab'.repeat(32)}`,
            action: 'accept' as const,
            escrow_id: RECONCILE_UUID,
            chain_id: 'eip155:84532',
            submitted_at: new Date(NOW.getTime() - RECONCILE_MIN_AGE_MS - 1),
          },
        ]
      },
      async markAttemptFailed(tx_ref, code) {
        failed.push({ tx_ref, code })
      },
    },
    chains,
    queue: {
      async enqueue(_name, payload) {
        enqueued.push((payload as { tx_ref: string }).tx_ref)
        return { job_id: 'x' }
      },
    },
    log: { info() {}, warn() {} },
    now: () => NOW,
  }
  return { deps, failed, enqueued }
}

test('reconcile: an OLD-contract attempt probes as a SUCCESS, so verify-tx applies it', async () => {
  const { deps, failed, enqueued } = evmReconcile([NEW_CONTRACT, OLD_CONTRACT])
  const result = await reconcileEscrowsHandler(deps, WINDOW)

  assert.strictEqual(result.enqueued, 1, 'the settled transition must reach verify-tx')
  assert.strictEqual(result.timed_out, 0)
  assert.strictEqual(enqueued.length, 1)
  assert.deepStrictEqual(failed, [], 'reconcile itself marks nothing failed')

  // The assertion that actually pins C1. Reconcile enqueues on "confirmed" in
  // EITHER direction, so its own counters look identical before and after the
  // fix — the damage lands one step later, where verify-tx turns a `failed`
  // verdict into TX_FAILED. What must hold is that the probe verdict is a
  // SUCCESS, which is only true once the decoder knows the old contract.
  const verdict = await deps.chains.get('eip155:84532').verifyTx(`0x${'ab'.repeat(32)}`, {
    expected_event: 'EscrowAccepted',
  })
  assert.strictEqual(
    'failed' in verdict ? verdict.failed : undefined,
    false,
    'a settled old-contract tx must not probe as failed — that is what writes TX_FAILED',
  )
})

test('reconcile: forget the old contract and the same attempt reads as a failure', async () => {
  // The pre-fix state, reproduced. The probe still says "confirmed" — so
  // reconcile enqueues — but the adapter reports the transaction as FAILED, and
  // verify-tx then writes TX_FAILED against a transaction that succeeded on
  // chain. This is the divergence #89 assessed as unreachable from here.
  const { deps } = evmReconcile([NEW_CONTRACT])
  const result = await reconcileEscrowsHandler(deps, WINDOW)

  assert.strictEqual(result.enqueued, 1)
  const adapterVerdict = await deps.chains.get('eip155:84532').verifyTx(`0x${'ab'.repeat(32)}`, {
    expected_event: 'EscrowAccepted',
  })
  assert.strictEqual('failed' in adapterVerdict ? adapterVerdict.failed : undefined, true)
})
