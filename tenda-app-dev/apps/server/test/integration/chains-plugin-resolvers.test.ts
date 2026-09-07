/**
 * The chains plugin's DB-BACKED RESOLVERS, and the two refusals they own (#112).
 *
 * `plugins/chains.ts` 41-56 and 62-76 — both resolvers entire, refusals AND
 * success paths — were executed by no test in the suite. Not because they are
 * exotic. The HTTP harness makes exactly one substitution, a FAKE chain
 * registry (helpers/test-app/fake-chain.ts), so every route suite in the repo
 * drives `fakeAdapter.buildTx` and none of them can reach the real one. These
 * resolvers are only reachable through an adapter the PLUGIN built, which is
 * what this file boots — the same approach, and now the same helpers, as the
 * #89 boot suite beside it.
 *
 * WHAT THE TWO REFUSALS ARE FOR:
 *   :49  no wallet linked for the chain's namespace → 404. The resolved wallet
 *        is the assignee baked into the transaction; without one the encoder
 *        would be handed nothing to encode.
 *   :69  asset not registered, or disabled, on this chain → 422. The row's
 *        `token_address` is the contract the escrow will pull funds from.
 *
 * NOTHING HERE TOUCHES THE CHAIN, and the refusal cases assert that rather than
 * assume it: the stub node records every call it receives and the count stays
 * zero, so both guards are proven to answer before any network read.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { assets, user_wallets } from '@tenda/shared/db/schema'
import type { AppError } from '@server/lib/errors'
import { chainEnvPrefix } from '@server/chains/secrets'
import type { BuildTxArgs, ChainAdapter } from '@server/chains/types'
import {
  TEST_ASSET,
  TEST_ASSET_ALT,
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  createUser,
  makeTransactable,
  useTestApp,
  type TestUser,
} from '../helpers/test-app'
import { startStubRpc, withEvmChainEnv, type StubRpc } from '../helpers/stub-rpc'
import { seedBootChain, withBootedChainsApp } from '../helpers/chains-boot'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const ESCROW_CONTRACT = '0x00000000000000000000000000000000000000bb'
const TREASURY = '0x00000000000000000000000000000000000000a1'

/** A distinct, encodable EVM address per digit. Never 0 — that is `address(0)`. */
const evmAddress = (digit: 2 | 3): string => `0x${String(digit).repeat(40)}`

/**
 * Boot the REAL plugin and hand `body` the adapter it built, plus the stub node
 * so a case can assert nothing was asked of the chain.
 *
 * The chain row is seeded BEFORE the boot on purpose: the plugin's
 * registry-sync gate reads it while loading, so seeding afterwards would refuse
 * the boot rather than the request.
 */
async function withPluginAdapter(
  body: (args: { adapter: ChainAdapter; rpc: StubRpc }) => Promise<void>,
): Promise<void> {
  await seedBootChain(getApp(), { escrow: ESCROW_CONTRACT, treasury: TREASURY })
  // Answers nothing: every case here must complete without asking it anything,
  // and `rpc.calls` is what proves that.
  const rpc = await startStubRpc(() => null)
  try {
    await withEvmChainEnv(
      {
        chainEnvPrefix: chainEnvPrefix(TEST_CHAIN_ID_ALT),
        rpcUrl: rpc.url,
        escrow: ESCROW_CONTRACT,
        treasury: TREASURY,
      },
      () =>
        withBootedChainsApp(async (app) => {
          await app.ready()
          await body({ adapter: app.chains.get(TEST_CHAIN_ID_ALT), rpc })
        }),
    )
  } finally {
    await rpc.close()
  }
}

/** A create build the encoder accepts; `asset` is what the asset cases vary. */
function createBuild(asset: string): BuildTxArgs {
  return {
    action: 'createEscrow',
    // Attribution only on this chain — sponsorship needs a paymaster URL, which
    // this deployment has none of, so nothing reads it.
    user_id: randomUUID(),
    payload: {
      escrow_id: randomUUID(),
      kind: 'gig',
      asset,
      amount_raw: '1000000',
      accept_deadline_unix: Math.floor(Date.now() / 1000) + 3_600,
      completion_duration_seconds: 86_400,
      dispute_bond_raw: '0',
      is_seeker: false,
      requires_approval: false,
      unassign_window_seconds: 0,
    },
  }
}

/** An assignAccept build, the shortest path to the WALLET resolver. */
function assignBuild(worker_user_id: string): BuildTxArgs {
  return {
    action: 'assignAccept',
    user_id: randomUUID(),
    payload: { escrow_id: randomUUID(), worker_user_id },
  }
}

// ---------- the asset resolver ------------------------------------------------

test('asset resolver: an asset this chain does not carry is 422, naming it', { skip }, async () => {
  const app = getApp()
  await withPluginAdapter(async ({ adapter, rpc }) => {
    const refused = (asset: string, why: string): Promise<void> =>
      assert.rejects(
        adapter.buildTx(createBuild(asset)),
        (err: AppError) =>
          err.statusCode === 422 &&
          err.code === 'ESCROW_INVALID_ASSET' &&
          err.message ===
            `asset '${asset}' is not registered (or disabled) on ${TEST_CHAIN_ID_ALT}`,
        why,
      )

    await refused('NOT_AN_ASSET', 'an id in no registry at all')
    // TEST_ASSET is a REAL asset — on the Solana chain. `assets.id` is a global
    // primary key, so that row exists and only the chain_id clause refuses it;
    // without that clause an escrow could be built on one chain against a token
    // that lives on another.
    await refused(TEST_ASSET, 'a real asset belonging to another chain')

    // Disabled, not absent. Same 422, and this is the clause an operator uses to
    // withdraw an asset without deleting the rows that reference it.
    await app.db.update(assets).set({ is_enabled: false }).where(eq(assets.id, TEST_ASSET_ALT))
    await refused(TEST_ASSET_ALT, 'a registered asset that is disabled')

    assert.strictEqual(rpc.calls.length, 0, 'the asset is resolved before any chain read')
  })
})

test('asset resolver: a registered asset resolves to its token address (the control)', { skip }, async () => {
  // Without this the three refusals above are satisfied by a resolver that
  // refuses everything — and the resolver's RETURN value is the point of it:
  // whatever it hands back becomes the token the escrow pulls from.
  const app = getApp()
  await withPluginAdapter(async ({ adapter }) => {
    const [asset] = await app.db
      .select()
      .from(assets)
      .where(and(eq(assets.id, TEST_ASSET_ALT), eq(assets.chain_id, TEST_CHAIN_ID_ALT)))

    const tx = await adapter.buildTx(createBuild(TEST_ASSET_ALT))
    assert.ok(tx.kind === 'evm-tx', `expected an evm-tx, got ${tx.kind}`)
    // Read from the row rather than restated as a literal: the assertion is
    // that the resolver returned THIS chain's recorded token, not that it
    // returned one particular string.
    assert.strictEqual(tx.approval?.token, asset.token_address)
    assert.strictEqual(tx.approval?.spender, ESCROW_CONTRACT)
    assert.strictEqual(tx.value, '0', 'an ERC-20 escrow carries no native value')
  })
})

// ---------- the wallet resolver -----------------------------------------------

test('wallet resolver: a user with no wallet on the namespace is 404', { skip }, async () => {
  const app = getApp()
  const noWallet = await createUser(app)
  const solanaOnly = await createUser(app)
  // Links a SOLANA wallet (the harness chain's namespace) and nothing else.
  await makeTransactable(app, solanaOnly.row.id)

  await withPluginAdapter(async ({ adapter, rpc }) => {
    const cases: ReadonlyArray<[TestUser, string]> = [
      [noWallet, 'a user with no wallet at all'],
      [solanaOnly, 'a user whose only wallet is on the WRONG namespace'],
    ]
    for (const [user, why] of cases) {
      await assert.rejects(
        adapter.buildTx(assignBuild(user.row.id)),
        (err: AppError) =>
          err.statusCode === 404 &&
          err.code === 'USER_NOT_FOUND' &&
          // `adapter.namespace` rather than the literal 'eip155': the resolver
          // is built per namespace, and a plugin that wired the Solana resolver
          // into the EVM adapter would both find solanaOnly's wallet AND name
          // the other namespace here. Two ways for this case to catch it.
          err.message === `no ${adapter.namespace} wallet linked for user ${user.row.id}`,
        why,
      )
    }
    assert.strictEqual(rpc.calls.length, 0, 'the wallet is resolved before any chain read')
  })
})

test('wallet resolver: the PRIMARY wallet is the one that resolves (the control)', { skip }, async () => {
  // Deterministic resolution for a user with several linked wallets, which is
  // the documented reason the query orders at all. The non-primary row is
  // inserted FIRST so an unordered read would return it — that is what makes
  // this case sensitive to the `orderBy` rather than to the row count.
  const app = getApp()
  const worker = await createUser(app)
  const secondary = evmAddress(2)
  const primary = evmAddress(3)
  await app.db.insert(user_wallets).values([
    { chain_ns: 'eip155', address: secondary, user_id: worker.row.id, is_primary: false },
    { chain_ns: 'eip155', address: primary, user_id: worker.row.id, is_primary: true },
  ])

  await withPluginAdapter(async ({ adapter }) => {
    const tx = await adapter.buildTx(assignBuild(worker.row.id))
    assert.ok(tx.kind === 'evm-tx', `expected an evm-tx, got ${tx.kind}`)
    // The assignee is an argument of the encoded call, so the calldata carries
    // the 20 bytes verbatim — enough to say WHICH of the two wallets resolved,
    // without decoding against an ABI this test would then be asserting twice.
    const data = tx.data.toLowerCase()
    assert.ok(data.includes(primary.slice(2).toLowerCase()), 'the primary wallet is the assignee')
    assert.ok(
      !data.includes(secondary.slice(2).toLowerCase()),
      'the non-primary wallet is not the assignee',
    )
  })
})
