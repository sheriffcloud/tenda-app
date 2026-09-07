/**
 * chains/{evm,solana}/rpc — the client-port seams (evmRpcFromClient,
 * solanaRpcFromConnection): response→interface mapping, null handling,
 * receipt-not-found, the tuple decode, and the Solana per-call timeout race.
 * Fully offline against fake ports — the network clients are never built.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  evmRpcFromClient,
  ESCROW_EVM_ABI,
  ZERO_ADDRESS,
  type EvmClientPort,
  type EvmClientReceipt,
} from '@server/chains/evm/rpc'
import {
  solanaRpcFromConnection,
  type SolanaConnectionPort,
} from '@server/chains/solana/rpc'

// ---------- EVM client port --------------------------------------------------

const CREATOR = '0x1111111111111111111111111111111111111111' as const
const WORKER = '0x2222222222222222222222222222222222222222' as const
const TX = `0x${'ab'.repeat(32)}` as const

function evmPort(over: Partial<EvmClientPort> = {}): EvmClientPort {
  return {
    async getTransactionReceipt() {
      throw new Error('not staged')
    },
    async getBlockNumber() {
      return 0n
    },
    async getLogs() {
      return []
    },
    async readContract() {
      return null
    },
    ...over,
  }
}

test('evmRpcFromClient.getTransactionReceipt: maps fields and copies topics into a fresh array', async () => {
  const topics = [`0x${'11'.repeat(32)}`] as `0x${string}`[]
  const receipt: EvmClientReceipt = {
    status: 'success',
    blockNumber: 42n,
    logs: [{ address: CREATOR, data: '0x', topics }],
  }
  const rpc = evmRpcFromClient(evmPort({ getTransactionReceipt: async () => receipt }))
  const r = await rpc.getTransactionReceipt(TX)
  assert.ok(r !== null)
  assert.strictEqual(r.status, 'success')
  assert.strictEqual(r.block_number, 42n)
  assert.deepStrictEqual(r.logs[0].topics, topics)
  assert.notStrictEqual(r.logs[0].topics, topics) // a copy, not the client's array
})

test('evmRpcFromClient.getTransactionReceipt: client throw (unknown hash) → null', async () => {
  const rpc = evmRpcFromClient(
    evmPort({
      getTransactionReceipt: async () => {
        throw new Error('TransactionReceiptNotFoundError')
      },
    }),
  )
  assert.strictEqual(await rpc.getTransactionReceipt(TX), null)
})

test('evmRpcFromClient.getBlockNumber: passes through the client value', async () => {
  const rpc = evmRpcFromClient(evmPort({ getBlockNumber: async () => 999n }))
  assert.strictEqual(await rpc.getBlockNumber(), 999n)
})

test('evmRpcFromClient.getLogRefs: forwards the window, drops pending logs, sorts ascending', async () => {
  const staged = [
    { transactionHash: TX, blockNumber: 20n },
    { transactionHash: null, blockNumber: null }, // pending log, must be dropped
    { transactionHash: `0x${'ef'.repeat(32)}` as const, blockNumber: 10n },
  ]
  let seen: { address: readonly `0x${string}`[]; fromBlock: bigint; toBlock: bigint } | null = null
  const rpc = evmRpcFromClient(
    evmPort({
      async getLogs(args) {
        seen = args
        return staged
      },
    }),
  )

  const refs = await rpc.getLogRefs([CREATOR], 5n, 25n)
  assert.deepStrictEqual(seen, { address: [CREATOR], fromBlock: 5n, toBlock: 25n })
  assert.deepStrictEqual(refs, [
    { tx_hash: `0x${'ef'.repeat(32)}`, block_number: 10n },
    { tx_hash: TX, block_number: 20n },
  ])
})

const ESCROW_ID_HEX = `0x${'cd'.repeat(16)}` as const

/**
 * What `getEscrow` returns: the NAMED struct, not the flattened positional
 * tuple the auto-generated `escrows` mapping getter produces. Written by name
 * on purpose — the old positional fixture had to be re-counted every time the
 * contract struct grew, and a miscount decoded silently.
 */
function escrowStruct(creator: string): Record<string, unknown> {
  return {
    escrowId: ESCROW_ID_HEX,
    kind: 1,
    asset: ZERO_ADDRESS, // native
    amount: 5_000n,
    creator,
    counterparty: WORKER,
    assignedCounterparty: ZERO_ADDRESS,
    status: 2,
    acceptDeadline: 1_900_000_000n,
    completionDuration: 7_200n,
    completionDeadline: 1_900_007_200n,
    approvalDeadline: 1_900_010_000n,
    disputeBond: 50n,
    isSeeker: true,
    raisedBy: ZERO_ADDRESS,
    requiresApproval: true,
    unassignWindowSeconds: 21_600n,
  }
}

test('evmRpcFromClient.readEscrow: decodes by name; sends getEscrow(bytes16) call', async () => {
  const calls: Array<{ functionName: string; args: readonly unknown[] }> = []
  const rpc = evmRpcFromClient(
    evmPort({
      async readContract(a) {
        calls.push({ functionName: a.functionName, args: a.args })
        return escrowStruct(CREATOR)
      },
    }),
  )
  const t = await rpc.readEscrow(CREATOR, ESCROW_ID_HEX)
  assert.ok(t !== null)
  assert.strictEqual(t.escrow_id, ESCROW_ID_HEX)
  assert.strictEqual(t.amount, 5_000n)
  assert.strictEqual(t.is_seeker, true)
  assert.strictEqual(t.raised_by, ZERO_ADDRESS)
  assert.strictEqual(t.requires_approval, true)
  assert.strictEqual(t.unassign_window_seconds, 21_600n)
  assert.strictEqual(calls[0].functionName, 'getEscrow')
  assert.deepStrictEqual(calls[0].args, [ESCROW_ID_HEX])
  assert.strictEqual(ESCROW_EVM_ABI.length > 0, true) // the wrapper passed the real ABI
})

test('evmRpcFromClient.readEscrow: zero-address creator (never created) → null', async () => {
  const rpc = evmRpcFromClient(evmPort({ readContract: async () => escrowStruct(ZERO_ADDRESS) }))
  assert.strictEqual(await rpc.readEscrow(CREATOR, ESCROW_ID_HEX), null)
})

// ---------- Solana connection port -------------------------------------------

function solPort(over: Partial<SolanaConnectionPort> = {}): SolanaConnectionPort {
  return {
    async getLatestBlockhash() {
      return { blockhash: 'BH', lastValidBlockHeight: 100 }
    },
    async getTransaction() {
      return null
    },
    async getAccountInfo() {
      return null
    },
    async getSignaturesForAddress() {
      return []
    },
    ...over,
  }
}

test('solanaRpcFromConnection.getLatestBlockhash: renames lastValidBlockHeight', async () => {
  const rpc = solanaRpcFromConnection(solPort())
  assert.deepStrictEqual(await rpc.getLatestBlockhash(), {
    blockhash: 'BH',
    last_valid_block_height: 100,
  })
})

test('solanaRpcFromConnection.getTransaction: unknown → null', async () => {
  const rpc = solanaRpcFromConnection(solPort({ getTransaction: async () => null }))
  assert.strictEqual(await rpc.getTransaction('sig'), null)
})

test('solanaRpcFromConnection.getTransaction: runtime error → failed + stringified reason', async () => {
  const rpc = solanaRpcFromConnection(
    solPort({
      getTransaction: async () => ({ meta: { err: { InstructionError: [0, 'Custom'] }, logMessages: ['a'] } }),
    }),
  )
  const r = await rpc.getTransaction('sig')
  assert.ok(r !== null)
  assert.strictEqual(r.failed, true)
  assert.strictEqual(r.failure_reason, JSON.stringify({ InstructionError: [0, 'Custom'] }))
  assert.deepStrictEqual(r.log_messages, ['a'])
})

test('solanaRpcFromConnection.getTransaction: success with no logs, and null meta → empty logs', async () => {
  const ok = solanaRpcFromConnection(
    solPort({ getTransaction: async () => ({ meta: { err: null } }) }),
  )
  const r1 = await ok.getTransaction('sig')
  assert.deepStrictEqual(r1, { failed: false, failure_reason: null, log_messages: [] })

  const noMeta = solanaRpcFromConnection(solPort({ getTransaction: async () => ({ meta: null }) }))
  const r2 = await noMeta.getTransaction('sig')
  assert.deepStrictEqual(r2, { failed: false, failure_reason: null, log_messages: [] })
})

test('solanaRpcFromConnection.getAccount: null → null; present → Buffer copy + owner', async () => {
  const empty = solanaRpcFromConnection(solPort({ getAccountInfo: async () => null }))
  assert.strictEqual(await empty.getAccount('addr'), null)

  const data = Buffer.from('hello')
  const present = solanaRpcFromConnection(
    solPort({ getAccountInfo: async () => ({ data, owner: 'OwnerProgram111' }) }),
  )
  const account = await present.getAccount('addr')
  assert.ok(account !== null)
  assert.strictEqual(account.data.toString(), 'hello')
  // The owner must survive the seam — it is the only thing distinguishing a
  // current account from a superseded program's identically-encoded one.
  assert.strictEqual(account.owner, 'OwnerProgram111')
})

test('solanaRpcFromConnection.getSignaturesForAddress: maps signature + slot, forwards limit', async () => {
  let seenLimit = 0
  const rpc = solanaRpcFromConnection(
    solPort({
      async getSignaturesForAddress(_address, opts) {
        seenLimit = opts.limit
        return [
          { signature: 's1', slot: 10 },
          { signature: 's2', slot: 11 },
        ]
      },
    }),
  )
  const out = await rpc.getSignaturesForAddress('addr', { limit: 50 })
  assert.deepStrictEqual(out, [
    { signature: 's1', slot: 10 },
    { signature: 's2', slot: 11 },
  ])
  assert.strictEqual(seenLimit, 50)
})

test('solanaRpcFromConnection: a call that never resolves rejects via the timeout', async () => {
  const rpc = solanaRpcFromConnection(
    solPort({ getLatestBlockhash: () => new Promise(() => {}) }), // never resolves
    5, // 5ms timeout
  )
  await assert.rejects(() => rpc.getLatestBlockhash(), /solana rpc timeout after 5ms: getLatestBlockhash/)
})

test('solanaRpcFromConnection: an underlying rejection propagates (not swallowed by the timeout)', async () => {
  const rpc = solanaRpcFromConnection(
    solPort({
      getTransaction: async () => {
        throw new Error('rpc 429 rate limited')
      },
    }),
  )
  await assert.rejects(() => rpc.getTransaction('sig'), /rpc 429 rate limited/)
})
