/**
 * What the LISTENER PLUGIN actually asks the chain for (open_issues #89).
 *
 * Why this exists at its own level: the same fix already shipped once with the
 * contract set computed correctly, threaded correctly, and never reaching the
 * adapter — because `buildAdapters` was called without it. Every unit test
 * passed, because each supplied the set itself. A correct function and a correct
 * call site are different claims, and only the second one keeps funds reachable.
 *
 * So this drives the REAL plugin against a stub JSON-RPC server and asserts on
 * the `eth_getLogs` request that comes out of it. Nothing is stubbed between the
 * plugin and the wire.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import type { FastifyInstance } from 'fastify'
import { evmPollTick } from '@server/chains/evm/listener-polling'
import { startStubRpc, withEvmChainEnv } from '../helpers/stub-rpc'
import { evmListenerDeps, evmWatchSet } from '@server/plugins/listeners'
import { buildContractRegistry } from '@server/chains/contracts'
import { chainEnvPrefix } from '@server/chains/secrets'
import type { ChainAdapter, ChainRegistry } from '@server/chains/types'
import { chains as chainsTable } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const CHAIN_ID = 'eip155:84532'
const CURRENT = '0x00000000000000000000000000000000000000bb'
const PREVIOUS = '0x00000000000000000000000000000000000000aa'
const TREASURY = '0x00000000000000000000000000000000000000a1'

// ---------- the pure half -----------------------------------------------------

function fakeFastify(registry: ReturnType<typeof buildContractRegistry>): FastifyInstance {
  // Only `contracts` is read by evmWatchSet; the cast keeps the fixture honest
  // about that rather than fabricating a whole instance.
  return { contracts: registry } as unknown as FastifyInstance
}

test('evmWatchSet: returns every contract the registry knows for the chain', () => {
  const registry = buildContractRegistry(
    [{ chain_id: CHAIN_ID, namespace: 'eip155', escrowAddress: CURRENT }],
    [{ chain_id: CHAIN_ID, address: PREVIOUS }],
  )
  const set = evmWatchSet(fakeFastify(registry), CHAIN_ID, CURRENT)
  assert.deepStrictEqual([...set].sort(), [PREVIOUS, CURRENT].sort())
})

test('evmWatchSet: a chain absent from the registry still watches its configured contract', () => {
  // Never return an empty set: a listener watching nothing is silent, and
  // silence is indistinguishable from "no activity".
  const set = evmWatchSet(fakeFastify(buildContractRegistry([], [])), CHAIN_ID, CURRENT)
  assert.deepStrictEqual([...set], [CURRENT])
})

test('evmWatchSet: normalises the configured address in the fallback', () => {
  const checksummed = '0x00000000000000000000000000000000000000Bb'
  const set = evmWatchSet(fakeFastify(buildContractRegistry([], [])), CHAIN_ID, checksummed)
  assert.deepStrictEqual([...set], [CURRENT])
})

// ---------- the call site, over a real socket --------------------------------

function adapterFor(chain_id: string): ChainAdapter {
  const unused = () => {
    throw new Error('not used by the listener plugin')
  }
  return {
    namespace: 'eip155',
    chain_id,
    escrowAddress: CURRENT,
    buildTx: unused,
    verifyTx: unused,
    verifyAuthSig: async () => true,
    fetchEscrowState: unused,
    computeFee: () => '0',
  }
}

test('the plugin\'s OWN poll config reaches the wire with every known contract', { skip }, async () => {
  // End to end over a real socket: the plan the plugin builds → the real
  // `evmPollTick` → a real HTTP JSON-RPC round trip. The assertion is on the
  // `eth_getLogs` request itself, so nothing between the plugin and the node is
  // taken on trust.
  //
  // Driving the tick directly rather than waiting on the listener: the timer
  // skeleton schedules its first tick a full interval out (recursive setTimeout,
  // no leading call), and `createEvmPollingListener` is a pass-through of
  // exactly this object — so the plan IS what the listener would poll with.
  const rpc = await startStubRpc((method) =>
    method === 'eth_blockNumber' ? '0x64' : method === 'eth_chainId' ? '0x14a34' : [],
  )
  const enqueued: string[] = []

  // `chain_cursors.chain_id` references `chains`, so the row must exist before
  // the tick writes a cursor at the end of its first range.
  const testApp = getApp()
  await testApp.db
    .insert(chainsTable)
    .values({
      id: CHAIN_ID,
      namespace: 'eip155',
      display_name: 'Base Sepolia',
      treasury_address: TREASURY,
      escrow_program: CURRENT,
    })
    .onConflictDoNothing({ target: chainsTable.id })

  const adapters = [adapterFor(CHAIN_ID)]
  const chains: ChainRegistry = {
    get: () => adapters[0],
    has: () => true,
    list: () => adapters,
    verifyAuthSig: async () => true,
  }
  const fastify = {
    chains,
    // The registry knows BOTH generations — the state after a redeploy.
    contracts: buildContractRegistry(
      [{ chain_id: CHAIN_ID, namespace: 'eip155', escrowAddress: CURRENT }],
      [{ chain_id: CHAIN_ID, address: PREVIOUS }],
    ),
    db: testApp.db,
    queue: {
      async enqueue(_name: string, payload: unknown) {
        enqueued.push((payload as { tx_ref: string }).tx_ref)
        return { job_id: 'x' }
      },
    },
    log: { info() {}, warn() {} },
  } as unknown as FastifyInstance

  await withEvmChainEnv(
    {
      chainEnvPrefix: chainEnvPrefix(CHAIN_ID),
      rpcUrl: rpc.url,
      escrow: CURRENT,
      treasury: TREASURY,
    },
    async () => {
    const plans = evmListenerDeps(fastify)
    assert.strictEqual(plans.length, 1, 'exactly one EVM chain is configured here')

    await evmPollTick(plans[0])

    const logCalls = rpc.callsTo('eth_getLogs')
    assert.ok(logCalls.length > 0, 'the tick must have scanned at least one range')
    for (const call of logCalls) {
      const address = (call.params[0] as { address?: unknown }).address
      assert.ok(Array.isArray(address), 'eth_getLogs must carry an ADDRESS ARRAY, not one address')
      const seen = (address as string[]).map((a) => a.toLowerCase()).sort()
      assert.deepStrictEqual(
        seen,
        [PREVIOUS, CURRENT].sort(),
        'the superseded contract must be on the wire — this is the assertion that catches ' +
          'a registry that never reaches the listener',
      )
    }
      assert.deepStrictEqual(enqueued, [], 'the stub returns no logs, so nothing is enqueued')
    },
  )
  await rpc.close()
})
