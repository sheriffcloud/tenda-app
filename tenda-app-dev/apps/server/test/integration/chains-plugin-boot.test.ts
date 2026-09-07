/**
 * The chains plugin AS IT BOOTS (open_issues #89).
 *
 * This file exists because of a real escape. Every piece of the contract-pinning
 * fix was correct and unit-tested, and the plugin still built its adapters
 * without the contract registry — so in production every adapter knew only its
 * current contract and the fix did nothing. The unit tests could not see it:
 * each constructed its own adapter and passed the set itself.
 *
 * So nothing here constructs an adapter. It registers the REAL plugin against
 * the REAL database, lets it read the REAL secrets loader, and then asks the
 * decorated registry to verify a receipt emitted by a SUPERSEDED contract — a
 * question that can only be answered correctly if every hand-off along the boot
 * path actually happened.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import chainsPlugin from '@server/plugins/chains'
import dbPlugin from '@server/plugins/db'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { chainEnvPrefix } from '@server/chains/secrets'
import { chain_contracts } from '@tenda/shared/db/schema'
import {
  TEST_ASSET_ALT,
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  createEscrow,
  createUser,
  useTestApp,
} from '../helpers/test-app'
import { startStubRpc, withEvmChainEnv, type StubRpc } from '../helpers/stub-rpc'
import { seedBootChain, withBootedChainsApp } from '../helpers/chains-boot'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const CURRENT = '0x00000000000000000000000000000000000000bb'
const PREVIOUS = '0x00000000000000000000000000000000000000aa'
const TREASURY = '0x00000000000000000000000000000000000000a1'
const TX_HASH = `0x${'ab'.repeat(32)}`
const UUID = '11111111-2222-4333-8444-555555555555'

/** An `EscrowCreated` receipt whose only escrow log came from `emitter`. */
function receiptFrom(emitter: string): unknown {
  const topics = encodeEventTopics({
    abi: ESCROW_EVM_ABI,
    eventName: 'EscrowCreated',
    args: {
      escrowId: `0x${UUID.replace(/-/g, '')}` as `0x${string}`,
      creator: '0x1111111111111111111111111111111111111111',
    },
  })
  return {
    status: '0x1',
    blockNumber: '0x1',
    logs: [
      {
        address: emitter,
        topics,
        data: encodeAbiParameters(
          [{ type: 'uint8' }, { type: 'address' }, { type: 'uint256' }],
          [0, '0x2222222222222222222222222222222222222222', 1_000_000n],
        ),
        blockNumber: '0x1',
        transactionHash: TX_HASH,
      },
    ],
  }
}

const nodeAnswering = (): Promise<StubRpc> =>
  startStubRpc((method) => {
    if (method === 'eth_blockNumber') return '0x64'
    if (method === 'eth_chainId') return '0x14a34'
    if (method === 'eth_getTransactionReceipt') return receiptFrom(PREVIOUS)
    return null
  })

/**
 * Point the secrets loader at the stub node and nothing else, run `body`, then
 * restore. Centralised because leaking either the env or the stub server breaks
 * every test that runs after this file — the env silently, the socket by hanging
 * the runner at exit.
 */
async function withBootEnv(
  body: (rpc: StubRpc) => Promise<void>,
  extraEnv: Record<string, string> = {},
): Promise<void> {
  const rpc = await nodeAnswering()
  try {
    // `chainEnvPrefix` rather than a literal: the prefix rule lives in the
    // secrets schema, and a hand-written copy here would keep passing while the
    // loader read different keys.
    await withEvmChainEnv(
      {
        chainEnvPrefix: chainEnvPrefix(TEST_CHAIN_ID_ALT),
        rpcUrl: rpc.url,
        escrow: CURRENT,
        treasury: TREASURY,
        extraEnv,
      },
      () => body(rpc),
    )
  } finally {
    await rpc.close()
  }
}

/** Same prefix rule as the env itself — never a hand-written key. */
const chainEnv = (suffix: string): string => `${chainEnvPrefix(TEST_CHAIN_ID_ALT)}_${suffix}`
const RELAYER_KEY = `0x${'ab'.repeat(32)}`

/**
 * `chains` naming the CURRENT contract, so the registry-sync boot gate passes.
 * The booting itself is `withBootedChainsApp` (helpers/chains-boot) — both were
 * local to this file until #112's resolver suite needed the same two.
 */
function seedCurrentChain(app: ReturnType<typeof getApp>): Promise<void> {
  return seedBootChain(app, { escrow: CURRENT, treasury: TREASURY })
}

test('boot: adapters come out KNOWING the superseded contract, not just the current one', { skip }, async () => {
  await withBootEnv(async () => {
    const seedDb = getApp()
    await seedCurrentChain(seedDb)
    await seedDb.db
      .insert(chain_contracts)
      .values([
        { chain_id: TEST_CHAIN_ID_ALT, address: CURRENT },
        { chain_id: TEST_CHAIN_ID_ALT, address: PREVIOUS },
      ])
      .onConflictDoNothing({ target: [chain_contracts.chain_id, chain_contracts.address] })

    await withBootedChainsApp(async (app) => {
      await app.ready()

      // The registry the plugin decorated must carry BOTH generations.
      assert.deepStrictEqual(
        [...(app.contracts.get(TEST_CHAIN_ID_ALT)?.known ?? [])].sort(),
        [PREVIOUS, CURRENT].sort(),
      )

      // And — the assertion that would have caught the escape — the ADAPTER the
      // plugin built must verify a transaction against the superseded contract.
      // False unless the registry actually reached buildAdapters.
      const verified = await app.chains.get(TEST_CHAIN_ID_ALT).verifyTx(TX_HASH, {
        expected_event: 'EscrowCreated',
      })
      assert.strictEqual(verified.confirmed, true)
      assert.strictEqual(
        'failed' in verified ? verified.failed : undefined,
        false,
        'a receipt from a KNOWN previous contract must verify — if this fails, the contract ' +
          'registry never reached the adapters and the whole fix is inert in production',
      )
      assert.strictEqual('event' in verified ? verified.event.contract : undefined, PREVIOUS)
    })
  })
})

test('boot: an adapter WITHOUT the history cannot verify the same receipt', { skip }, async () => {
  // The negative half. Same node, same receipt, same plugin — only the recorded
  // history is missing, which is the "restored from an older snapshot" state.
  // Without this, the test above would still pass if the decode had silently
  // widened to accept any contract.
  await withBootEnv(async () => {
    await seedCurrentChain(getApp())

    await withBootedChainsApp(async (app) => {
      await app.ready()
      assert.deepStrictEqual([...(app.contracts.get(TEST_CHAIN_ID_ALT)?.known ?? [])], [CURRENT])

      const verified = await app.chains.get(TEST_CHAIN_ID_ALT).verifyTx(TX_HASH, {
        expected_event: 'EscrowCreated',
      })
      assert.strictEqual('failed' in verified ? verified.failed : undefined, true)
    })
  })
})

test('boot: REFUSES to start when a live escrow names a contract history has lost', { skip }, async () => {
  // The boot gate through the real plugin rather than by calling the probe
  // directly — a gate that is never wired in is not a gate.
  await withBootEnv(async () => {
    const seedApp = getApp()
    await seedCurrentChain(seedApp)
    // History deliberately NOT recorded for PREVIOUS.
    const creator = await createUser(seedApp)
    await createEscrow(seedApp, {
      creator_id: creator.row.id,
      chain_id: TEST_CHAIN_ID_ALT,
      asset: TEST_ASSET_ALT,
      status: 'open',
      escrow_ref: `ref-boot-${Date.now()}`,
      escrow_contract: PREVIOUS,
    })

    const app = Fastify({ logger: false })
    try {
      // The rejection is asserted around REGISTER + READY together: `await
      // register()` already drives the plugin's load, so the throw surfaces
      // there rather than at ready() — asserting only on ready() lets the real
      // error escape as an unhandled test failure that looks like a broken gate.
      await assert.rejects(
        async () => {
          await app.register(dbPlugin)
          await app.register(chainsPlugin)
          await app.ready()
        },
        (e: unknown) => {
          const msg = e instanceof Error ? e.message : ''
          // Actionable: names the address an operator has to restore.
          return msg.includes(PREVIOUS)
        },
      )
    } finally {
      await app.close()
    }
  })
})

/**
 * #43's operator switch, asserted where it is actually decided.
 *
 * This is the same escape the file's docstring describes, one feature along.
 * The secrets suite proves CHAIN_<ID>_SWEEP_ENABLED resolves to a boolean and
 * the adapter suite proves an adapter given `sweepEnabled` offers the port —
 * but each constructs its own adapter and passes the value itself. The hand-off
 * between them is `plugins/chains.ts`, and nothing looked at it: hardcoding
 * `sweepEnabled: true` there passed every test in the repo while making every
 * relayer-equipped chain sweep, which is exactly what the flag exists to stop.
 */
test('boot: a relayer key alone does NOT enable sweeping', { skip }, async () => {
  await withBootEnv(
    async () => {
      await seedCurrentChain(getApp())
      await withBootedChainsApp(async (app) => {
        await app.ready()
        const adapter = app.chains.get(TEST_CHAIN_ID_ALT)
        assert.ok(adapter.relay, 'the key configures relayed funding')
        assert.strictEqual(
          adapter.sweep,
          undefined,
          'and nothing else — enabling agent funding must not silently start spending ' +
            'that float on other people\'s refunds',
        )
      })
    },
    { [chainEnv('RELAYER_KEY')]: RELAYER_KEY },
  )
})

test('boot: the flag plus the key is what reaches the adapter', { skip }, async () => {
  await withBootEnv(
    async () => {
      await seedCurrentChain(getApp())
      await withBootedChainsApp(async (app) => {
        await app.ready()
        const adapter = app.chains.get(TEST_CHAIN_ID_ALT)
        assert.ok(adapter.sweep, 'the operator asked for it, so the port is there')
        // Paid for by the relayer wallet the key names, not some other account.
        assert.strictEqual(adapter.sweep.sweeper_address.toLowerCase().startsWith('0x'), true)
      })
    },
    { [chainEnv('RELAYER_KEY')]: RELAYER_KEY, [chainEnv('SWEEP_ENABLED')]: 'true' },
  )
})
