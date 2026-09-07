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
import { buildContractRegistry, type ContractRegistry } from '@server/chains/contracts'
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
/**
 * A port nothing listens on. The two refusal suites assert on the PLAN
 * `evmListenerDeps` returns and never run a tick, so this is never dialled —
 * and pointing it at a live stub would only add a socket to leak. Named rather
 * than repeated so it cannot be "fixed" into a real endpoint at one call site.
 */
const UNDIALLED_RPC = 'http://127.0.0.1:1'

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
  // Never return an empty set — and NOT because an empty one would be quiet.
  // `eth_getLogs` reads an empty address array as "no address filter" rather
  // than "match nothing" (measured against a real node during #45), so the
  // listener would subscribe to every log on the chain. That is why
  // `evmListenerDeps` refuses an empty set outright; this fallback is what
  // keeps a registry-less chain from reaching that state in the first place.
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

/**
 * The plugin surface `evmListenerDeps` actually reads.
 *
 * Shared by every suite in this file — the one that drives a real tick over a
 * socket, and the two that only inspect the plan — because they need the same
 * fake instance and differ solely in what they observe. Both observers are
 * optional callbacks rather than fields the caller assembles, so no suite has
 * to restate the parts it does not care about.
 */
function listenerFastify(opts: {
  contracts: ContractRegistry
  /** Called for every enqueue; the wire suite records tx_refs through it. */
  onEnqueue?: (payload: { tx_ref: string }) => void
  /** Called for every warn; the refusal suites assert on what arrives here. */
  onWarn?: (obj: { chain_id?: string }, msg: string) => void
}): FastifyInstance {
  const adapters = [adapterFor(CHAIN_ID)]
  return {
    chains: {
      get: () => adapters[0],
      has: () => true,
      list: () => adapters,
      verifyAuthSig: async () => true,
    } satisfies ChainRegistry,
    contracts: opts.contracts,
    db: getApp().db,
    queue: {
      async enqueue(_name: string, payload: unknown) {
        opts.onEnqueue?.(payload as { tx_ref: string })
        return { job_id: 'x' }
      },
    },
    log: {
      info() {},
      warn(obj: { chain_id?: string }, msg: string) {
        opts.onWarn?.(obj, msg)
      },
    },
  } as unknown as FastifyInstance
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
  // `finally`, never a trailing `await rpc.close()` (#48): an assertion that
  // throws before an unguarded close leaves the listener up and node never
  // exits, so a RED test becomes a HUNG GATE and the failure it found is
  // never reported. The three sibling stub-rpc suites all close this way.
  try {
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

    const fastify = listenerFastify({
      // The registry knows BOTH generations — the state after a redeploy.
      contracts: buildContractRegistry(
        [{ chain_id: CHAIN_ID, namespace: 'eip155', escrowAddress: CURRENT }],
        [{ chain_id: CHAIN_ID, address: PREVIOUS }],
      ),
      onEnqueue: (payload) => enqueued.push(payload.tx_ref),
    })

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
  } finally {
    await rpc.close()
  }
})

// ---------- the empty-watch-set refusal (#45) ---------------------------------

/**
 * A registry that VIOLATES its own invariant: an entry whose `known` set is
 * empty. Unreachable through `buildContractRegistry`, which seeds `known` with
 * `current` and documents that the union "is not optional" — so it is built by
 * hand here, which is the only way to exercise the guard at all.
 */
function registryWithEmptyKnown(chain_id: string): ContractRegistry {
  const entry = { namespace: 'eip155' as const, current: CURRENT, known: new Set<string>() }
  return {
    get: (id) => (id === chain_id ? entry : undefined),
    list: () => [{ chain_id, ...entry }],
  }
}

test('evmListenerDeps: an EMPTY watch set starts no listener, and says why', { skip }, async () => {
  // #45. An empty address array is not "match nothing" to eth_getLogs — it is
  // "no address filter" (measured against a real node: getLogRefs([]) and
  // getLogRefs([USDC]) returned the same refs). Starting a listener on one
  // would enqueue a verify-tx job for EVERY log-bearing transaction on the
  // chain, swamping the queue and breaking verification everywhere, not just
  // here. Refusing loses nothing: neither outcome is a working backstop.
  const warnings: { chain_id?: string; msg: string }[] = []
  await withEvmChainEnv(
    { chainEnvPrefix: chainEnvPrefix(CHAIN_ID), rpcUrl: UNDIALLED_RPC, escrow: CURRENT, treasury: TREASURY },
    async () => {
      const plans = evmListenerDeps(
        listenerFastify({
          contracts: registryWithEmptyKnown(CHAIN_ID),
          onWarn: (obj, msg) => warnings.push({ ...obj, msg }),
        }),
      )
      assert.deepStrictEqual(plans, [], 'no plan may be built on an empty watch set')
      // The SPECIFIC warning, not the count: this chain also has no
      // ESCROW_DEPLOY_BLOCK here, which warns for its own unrelated reason, and
      // a total would make this test fail the next time any boot line is added.
      const refusals = warnings.filter((w) => /empty contract watch set/.test(w.msg))
      assert.strictEqual(refusals.length, 1, 'the refusal is announced, not silent')
      assert.strictEqual(refusals[0].chain_id, CHAIN_ID, 'and it names the chain it dropped')
    },
  )
})

test('evmListenerDeps: a POPULATED watch set is untouched by that guard', { skip }, async () => {
  // The other half, and the one that catches a guard which over-refuses: the
  // ordinary chain must still get its listener, with both generations on it.
  const warnings: { chain_id?: string; msg: string }[] = []
  const healthy = buildContractRegistry(
    [{ chain_id: CHAIN_ID, namespace: 'eip155', escrowAddress: CURRENT }],
    [{ chain_id: CHAIN_ID, address: PREVIOUS }],
  )
  await withEvmChainEnv(
    { chainEnvPrefix: chainEnvPrefix(CHAIN_ID), rpcUrl: UNDIALLED_RPC, escrow: CURRENT, treasury: TREASURY },
    async () => {
      const plans = evmListenerDeps(
        listenerFastify({
          contracts: healthy,
          onWarn: (obj, msg) => warnings.push({ ...obj, msg }),
        }),
      )
      assert.strictEqual(plans.length, 1)
      assert.deepStrictEqual(
        [...plans[0].escrow_contracts].map((a) => a.toLowerCase()).sort(),
        [PREVIOUS, CURRENT].sort(),
      )
      assert.deepStrictEqual(
        warnings.filter((w) => /empty contract watch set/.test(w.msg)),
        [],
        'the guard must not fire on a healthy registry',
      )
    },
  )
})
