/**
 * The chains plugin's remaining DEPS, and its boot refusal (#114).
 *
 * #112 closed the two DB-backed resolvers in `plugins/chains.ts`. What was left
 * with zero hits is everything else the plugin injects or refuses:
 *   105-116  `verifyWalletOwnership` — the gate on permit-payload building
 *   123-130  `shouldSponsor` / `releaseSponsorship` — the sponsorship lifecycle
 *   157-160  the `no chains configured` boot throw
 * None is a `throw new AppError`, so the #105 refusal sweep never looked at
 * them; all three are only reachable through an app that boots the REAL plugin,
 * which is why they sit here beside the resolver suite rather than in a route
 * test.
 *
 * THE SPONSORSHIP CASE IS THE VALUABLE ONE. Reserve-then-release is the whole
 * design — the slot is decremented BEFORE the paymaster is asked, so a
 * concurrent request cannot double-spend it, and every failure path after that
 * has to give it back. A leak there costs a real user a free transaction and
 * shows up as nothing at all.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getAddress } from 'viem'
import { user_wallets, users } from '@tenda/shared/db/schema/identity'
import type { AppError } from '@server/lib/errors'
import { chainEnvPrefix } from '@server/chains/secrets'
import type { BuildTxArgs, ChainAdapter } from '@server/chains/types'
import {
  TEST_ASSET_ALT,
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  TEST_NATIVE_ASSET,
  createUser,
  useTestApp,
  type TestUser,
} from '../helpers/test-app'
import { startStubRpc, withEvmChainEnv, type StubRpc } from '../helpers/stub-rpc'
import { seedBootChain, withBootedChainsApp, withNoChainsConfigured } from '../helpers/chains-boot'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const ESCROW_CONTRACT = '0x00000000000000000000000000000000000000bb'
const TREASURY = '0x00000000000000000000000000000000000000a1'
/** Stored lower-cased, as the link route normalises EVM addresses. */
const OWNER_ADDRESS = `0x${'ab'.repeat(20)}`

/**
 * Boot the REAL plugin against a stub node and hand `body` the adapter it
 * built. `paymasterUrl` is what decides whether the sponsorship deps are wired
 * at all — the plugin only attaches them for a `gasPolicy: 'paymaster'` chain,
 * and the adapter only calls them when a paymaster client exists.
 */
async function withPluginAdapter(
  args: { paymaster?: boolean; respond?: (method: string) => unknown },
  body: (ctx: { adapter: ChainAdapter; rpc: StubRpc }) => Promise<void>,
): Promise<void> {
  await seedBootChain(getApp(), { escrow: ESCROW_CONTRACT, treasury: TREASURY })
  const rpc = await startStubRpc((method) => args.respond?.(method) ?? null)
  const prefix = chainEnvPrefix(TEST_CHAIN_ID_ALT)
  try {
    await withEvmChainEnv(
      { chainEnvPrefix: prefix, rpcUrl: rpc.url, escrow: ESCROW_CONTRACT, treasury: TREASURY },
      async () => {
        // Set INSIDE the wrapper: it clears every CHAIN_* key on the way in, so
        // an assignment before it would be wiped.
        if (args.paymaster === true) process.env[`${prefix}_PAYMASTER_URL`] = rpc.url
        await withBootedChainsApp(async (app) => {
          await app.ready()
          await body({ adapter: app.chains.get(TEST_CHAIN_ID_ALT), rpc })
        })
      },
    )
  } finally {
    await rpc.close()
  }
}

/** A user with a linked, verified EVM wallet — the permit owner. */
async function userWithWallet(address = OWNER_ADDRESS): Promise<TestUser> {
  const app = getApp()
  const user = await createUser(app)
  await app.db
    .insert(user_wallets)
    .values({ chain_ns: 'eip155', address, user_id: user.row.id })
  return user
}

// ---------- verifyWalletOwnership: the permit-owner gate -----------------------

test('permit payload: an owner that is not a linked wallet is refused', { skip }, async () => {
  const app = getApp()
  const owner = await userWithWallet()
  const stranger = await createUser(app)

  await withPluginAdapter({}, async ({ adapter, rpc }) => {
    assert.ok(adapter.buildPermitPayload, 'the EVM adapter exposes permit assembly')
    const refused = (user_id: string, address: string, why: string): Promise<void> =>
      assert.rejects(
        adapter.buildPermitPayload!({
          user_id,
          owner: address,
          asset: TEST_ASSET_ALT,
          value_raw: '1000000',
        }),
        (err: AppError) =>
          err.statusCode === 422 &&
          /owner is not one of your verified linked wallets/.test(err.message),
        why,
      )

    await refused(stranger.row.id, OWNER_ADDRESS, "somebody else's wallet")
    await refused(owner.row.id, `0x${'cd'.repeat(20)}`, 'an address nobody has linked')
    assert.strictEqual(rpc.calls.length, 0, 'ownership is settled before any chain read')
  })
})

test('permit payload: the owner check is case-insensitive, and lets a real owner past', { skip }, async () => {
  // EVM addresses are stored lower-cased but wallets hand back checksummed
  // ones, so an exact comparison would refuse the very user it is protecting.
  //
  // "Past the gate" is asserted by the NEXT refusal, which is a different one:
  // the harness's native asset has no permit entry in the manifest, so the
  // capability check answers instead — reached only if ownership passed, and
  // still before any RPC.
  //
  // The second spelling is CHECKSUMMED, not upper-cased — measured, having
  // tried the upper-cased one first: viem's `isAddress` is strict about EIP-55,
  // so `0xABAB…` is refused two guards earlier as "not a 0x-hex EVM address".
  // A checksummed address is also what a wallet actually hands back.
  const app = getApp()
  const owner = await userWithWallet()

  await withPluginAdapter({}, async ({ adapter, rpc }) => {
    for (const spelling of [OWNER_ADDRESS, getAddress(OWNER_ADDRESS)]) {
      await assert.rejects(
        adapter.buildPermitPayload!({
          user_id: owner.row.id,
          owner: spelling,
          asset: TEST_NATIVE_ASSET,
          value_raw: '1000000',
        }),
        (err: AppError) => err.statusCode === 422 && /no EIP-2612 permit support/.test(err.message),
        spelling,
      )
    }
    assert.strictEqual(rpc.calls.length, 0)
    // The row really is stored lower-cased, so the case-insensitive match above
    // is doing work rather than comparing two identical strings.
    const [row] = await app.db
      .select({ address: user_wallets.address })
      .from(user_wallets)
      .where(eq(user_wallets.user_id, owner.row.id))
    assert.strictEqual(row.address, OWNER_ADDRESS)
  })
})

// ---------- shouldSponsor / releaseSponsorship --------------------------------

function createBuild(user_id: string): BuildTxArgs {
  return {
    action: 'createEscrow',
    user_id,
    payload: {
      escrow_id: randomUUID(),
      kind: 'gig',
      asset: TEST_ASSET_ALT,
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

test('sponsorship: a refusing paymaster degrades to a plain tx AND gives the slot back', { skip }, async () => {
  // The reserve-then-release lifecycle, end to end through the real plugin.
  // `shouldSponsor` decrements `users.sponsored_tx_remaining` BEFORE the
  // paymaster is asked — that is what stops two concurrent builds spending one
  // slot — so every failure after it must give the slot back, or a user quietly
  // loses a free transaction they never received.
  const user = await userWithWallet()
  const before = await remainingSlots(user.row.id)
  assert.ok(before > 0, 'the fixture starts with sponsorship available')

  await withPluginAdapter(
    { paymaster: true, respond: () => ({ error: { message: 'no sponsorship available' } }) },
    async ({ adapter }) => {
      const tx = await adapter.buildTx(createBuild(user.row.id))
      // The documented degradation: the user pays their own gas rather than the
      // build failing.
      assert.strictEqual(tx.kind, 'evm-tx', 'a refused sponsorship still yields a signable tx')
    },
  )

  assert.strictEqual(
    await remainingSlots(user.row.id),
    before,
    'the reserved slot was released, not burned',
  )
})

test('sponsorship: with no paymaster configured the counter is never touched', { skip }, async () => {
  // The control for the case above, and the reason the plugin wires the deps by
  // gasPolicy: on a chain with no paymaster URL the adapter short-circuits
  // before `shouldSponsor`, so nothing reserves and nothing needs releasing.
  const user = await userWithWallet()
  const before = await remainingSlots(user.row.id)

  await withPluginAdapter({}, async ({ adapter }) => {
    const tx = await adapter.buildTx(createBuild(user.row.id))
    assert.strictEqual(tx.kind, 'evm-tx')
  })

  assert.strictEqual(await remainingSlots(user.row.id), before)
})

async function remainingSlots(user_id: string): Promise<number> {
  const [row] = await getApp()
    .db.select({ n: users.sponsored_tx_remaining })
    .from(users)
    .where(eq(users.id, user_id))
  return row.n
}

// ---------- the boot refusal ---------------------------------------------------

test('boot: a deployment with NO chain configured refuses to start', { skip }, async () => {
  // Not a request-time guard — the plugin throws while loading, so the process
  // never serves. That is the right answer: an escrow app with no chain cannot
  // build a transaction for anyone, and failing at boot is the difference
  // between a deploy that rolls back and a fleet that answers 500s.
  await withNoChainsConfigured(async () => {
    await assert.rejects(
      async () => {
        await withBootedChainsApp(async (app) => {
          await app.ready()
        })
      },
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /no chains configured/)
        // Actionable: it names an env var an operator can actually set.
        assert.match(err.message, /CHAIN_SOLANA_DEVNET_RPC_URL/)
        return true
      },
    )
  })
})
