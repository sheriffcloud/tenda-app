import { test } from 'node:test'
import * as assert from 'node:assert'
import { failoverSolanaRpc, type SolanaRpc } from '@server/chains/solana/rpc'

const PRIMARY_ERROR = new Error('primary unavailable')

function solRpc(over: Partial<SolanaRpc> = {}): SolanaRpc {
  return {
    getLatestBlockhash: async () => ({ blockhash: 'BH', last_valid_block_height: 100 }),
    getTransaction: async () => null,
    getAccount: async () => null,
    getSignaturesForAddress: async () => [],
    ...over,
  }
}

test('failover uses secondary after primary transport failure', async () => {
  let secondaryCalls = 0
  const rpc = failoverSolanaRpc(
    solRpc({ getTransaction: async () => { throw PRIMARY_ERROR } }),
    solRpc({ getTransaction: async () => { secondaryCalls += 1; return null } }),
  )
  assert.strictEqual(await rpc.getTransaction('sig'), null)
  assert.strictEqual(secondaryCalls, 1)
})

test('every Solana read method delegates to its matching fallback method', async () => {
  const secondary = solRpc({
    getLatestBlockhash: async () => ({ blockhash: 'fallback', last_valid_block_height: 200 }),
    getTransaction: async (signature) => ({
      failed: false,
      failure_reason: null,
      log_messages: [signature],
    }),
    getAccount: async (address) => ({ data: Buffer.from(address), owner: 'fallback-owner' }),
    getSignaturesForAddress: async (address, opts) => [{ signature: address, slot: opts.limit }],
  })
  const fail = async (): Promise<never> => { throw PRIMARY_ERROR }
  const rpc = failoverSolanaRpc(solRpc({
    getLatestBlockhash: fail,
    getTransaction: fail,
    getAccount: fail,
    getSignaturesForAddress: fail,
  }), secondary)

  assert.deepEqual(await rpc.getLatestBlockhash(), {
    blockhash: 'fallback',
    last_valid_block_height: 200,
  })
  assert.deepEqual((await rpc.getTransaction('tx'))?.log_messages, ['tx'])
  assert.equal((await rpc.getAccount('account'))?.owner, 'fallback-owner')
  assert.deepEqual(await rpc.getSignaturesForAddress('program', { limit: 7 }), [
    { signature: 'program', slot: 7 },
  ])
})

test('failover does not touch secondary after primary success', async () => {
  let secondaryCalls = 0
  const rpc = failoverSolanaRpc(
    solRpc({ getAccount: async () => ({ data: Buffer.from('ok'), owner: 'owner' }) }),
    solRpc({ getAccount: async () => { secondaryCalls += 1; return null } }),
  )
  assert.strictEqual((await rpc.getAccount('addr'))?.owner, 'owner')
  assert.strictEqual(secondaryCalls, 0)
})

test('surfaces the fallback error after both endpoints fail', async () => {
  const fallbackError = new Error('fallback unavailable')
  const rpc = failoverSolanaRpc(
    solRpc({ getTransaction: async () => { throw PRIMARY_ERROR } }),
    solRpc({ getTransaction: async () => { throw fallbackError } }),
  )
  await assert.rejects(rpc.getTransaction('sig'), fallbackError)
})
