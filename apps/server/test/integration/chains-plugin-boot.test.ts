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
import { eq } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import chainsPlugin from '@server/plugins/chains'
import dbPlugin from '@server/plugins/db'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { chainEnvPrefix } from '@server/chains/secrets'
import { chain_contracts, chains as chainsTable } from '@tenda/shared/db/schema'
import {
  TEST_ASSET_ALT,
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  createEscrow,
  createUser,
  seedAltChain,
  useTestApp,
} from '../helpers/test-app'
import { startStubRpc, withEvmChainEnv, type StubRpc } from '../helpers/stub-rpc'

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
async function withBootEnv(body: (rpc: StubRpc) => Promise<void>): Promise<void> {
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
      },
      () => body(rpc),
    )
  } finally {
    await rpc.close()
  }
}

/** A booted app carrying the real db + chains plugins, always closed. */
async function withBootedApp(body: (app: FastifyInstance) => Promise<void>): Promise<void> {
  const app = Fastify({ logger: false })
  try {
    await app.register(dbPlugin)
    await app.register(chainsPlugin)
    await body(app)
  } finally {
    await app.close()
  }
}

/** `chains` naming the CURRENT contract, so the registry-sync boot gate passes. */
async function seedCurrentChain(app: ReturnType<typeof getApp>): Promise<void> {
  // The shared helper owns the chain AND its asset row; hand-inserting only the
  // chain leaves `escrows_asset_chain_fk` unsatisfiable for any escrow on it.
  await seedAltChain(app)
  await app.db
    .update(chainsTable)
    .set({ treasury_address: TREASURY, escrow_program: CURRENT })
    .where(eq(chainsTable.id, TEST_CHAIN_ID_ALT))
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

    await withBootedApp(async (app) => {
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

    await withBootedApp(async (app) => {
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
