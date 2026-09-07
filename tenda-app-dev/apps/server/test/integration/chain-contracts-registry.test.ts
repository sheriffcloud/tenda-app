/**
 * The escrow-contract registry against a real database (open_issues #89):
 * how history is recorded, and the boot gate that refuses to start when a live
 * escrow names a contract the registry has forgotten.
 *
 * The recording half matters because it is what makes this maintainable: the
 * operator changes ONE env var on a redeploy and the history writes itself on
 * the next boot. If that ever silently stops appending, the failure is invisible
 * until an escrow is stranded — so it is pinned here rather than trusted.
 *
 * Gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { chain_contracts, chains, escrows } from '@tenda/shared/db/schema'
import { applySeed, buildSeedRows } from '@server/db/seed-v2'
import { loadChainSecrets } from '@server/chains/secrets'
import {
  assertEscrowContractsKnown,
  buildContractRegistry,
  findUnknownContractEscrows,
  loadContractRegistry,
} from '@server/chains/contracts'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  useTestApp,
  createUser,
  createEscrow,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const CURRENT = 'CurrentProgram11111111111111111111111111'
const PREVIOUS = 'PreviousProgram1111111111111111111111111'

const source = (escrowAddress: string) => ({
  chain_id: TEST_CHAIN_ID,
  namespace: 'solana' as const,
  escrowAddress,
})

/**
 * Insert a history row directly.
 *
 * Used where the SUBJECT is what the registry does with recorded history, not
 * how it got there — the seed's own append behaviour is driven end to end by the
 * `applySeedRows APPENDS on a redeploy` test below, so this shortcut cannot
 * silently diverge from it unnoticed.
 */
async function record(app: ReturnType<typeof getApp>, address: string): Promise<void> {
  await app.db
    .insert(chain_contracts)
    .values({ chain_id: TEST_CHAIN_ID, address })
    .onConflictDoNothing({ target: [chain_contracts.chain_id, chain_contracts.address] })
}

// ---------- loading ---------------------------------------------------------

test('registry: loads recorded history and unions it with the current contract', { skip }, async () => {
  const app = getApp()
  await record(app, PREVIOUS)

  const registry = await loadContractRegistry(app.db, [source(CURRENT)])
  const known = registry.get(TEST_CHAIN_ID)?.known

  assert.ok(known !== undefined)
  assert.ok(known.has(CURRENT), 'the configured contract is known even when unrecorded')
  assert.ok(known.has(PREVIOUS), 'recorded history must widen the set')
})

test('registry: an empty table still yields a usable set (fresh database)', { skip }, async () => {
  const app = getApp()
  const registry = await loadContractRegistry(app.db, [source(CURRENT)])
  assert.deepStrictEqual([...(registry.get(TEST_CHAIN_ID)?.known ?? [])], [CURRENT])
})

test('recording is append-only and idempotent — a re-run adds nothing', { skip }, async () => {
  // The seed runs on EVERY boot. If it overwrote instead of appending, a
  // redeploy would erase the previous contract and strand its escrows; if it
  // duplicated, the set would grow without bound.
  const app = getApp()
  await record(app, CURRENT)
  await record(app, CURRENT)
  await record(app, PREVIOUS)

  const rows = await app.db
    .select({ address: chain_contracts.address })
    .from(chain_contracts)
    .where(eq(chain_contracts.chain_id, TEST_CHAIN_ID))

  assert.strictEqual(rows.length, 2)
  assert.deepStrictEqual([...rows.map((r) => r.address)].sort(), [CURRENT, PREVIOUS].sort())
})

test('a chain removal takes its contract history with it, never blocks on it', { skip }, async () => {
  // The history is a pure child of the chain: no funds, rebuildable from config.
  // A RESTRICT here would make the registry impossible to unwind for no gain.
  const app = getApp()
  const CHAIN = 'eip155:31337'
  await app.db.insert(chains).values({
    id: CHAIN,
    namespace: 'eip155',
    display_name: 'Ephemeral',
    treasury_address: '0x0000000000000000000000000000000000000001',
    escrow_program: '0x0000000000000000000000000000000000000002',
  })
  await app.db
    .insert(chain_contracts)
    .values({ chain_id: CHAIN, address: '0x0000000000000000000000000000000000000002' })

  await app.db.delete(chains).where(eq(chains.id, CHAIN))

  const left = await app.db
    .select({ address: chain_contracts.address })
    .from(chain_contracts)
    .where(eq(chain_contracts.chain_id, CHAIN))
  assert.deepStrictEqual(left, [])
})


// ---------- the REAL seed, across a redeploy --------------------------------

test('applySeedRows APPENDS on a redeploy: new address arrives, old one stays', { skip }, async () => {
  // The behaviour the whole design rests on, driven through the real seed rather
  // than a hand-rolled insert: an operator changes ONE env var and the next boot
  // records the new contract without erasing the one still holding funds.
  const app = getApp()
  const env = (escrow: string) => ({
    CHAIN_EIP155_8453_RPC_URL: 'https://rpc.example',
    CHAIN_EIP155_8453_ESCROW_ADDR: escrow,
    CHAIN_EIP155_8453_TREASURY_ADDR: '0x00000000000000000000000000000000000000a1',
  })
  const OLD = '0x00000000000000000000000000000000000000e5'
  const NEW = '0x00000000000000000000000000000000000000f6'

  await applySeed(app.db, buildSeedRows(loadChainSecrets(env(OLD))))
  // The redeploy: same chain, different contract.
  await applySeed(app.db, buildSeedRows(loadChainSecrets(env(NEW))))

  const rows = await app.db
    .select({ address: chain_contracts.address })
    .from(chain_contracts)
    .where(eq(chain_contracts.chain_id, 'eip155:8453'))
  assert.deepStrictEqual(
    rows.map((r) => r.address).sort(),
    [OLD, NEW].sort(),
    'the superseded contract must survive the seed that introduced its successor',
  )

  // And `chains.escrow_program` followed config, so CURRENT and HISTORY agree on
  // which one is live.
  const [chain] = await app.db
    .select({ escrow_program: chains.escrow_program })
    .from(chains)
    .where(eq(chains.id, 'eip155:8453'))
  assert.strictEqual(chain.escrow_program, NEW)
})

// ---------- the boot gate (G5) ---------------------------------------------

test('boot gate: passes when every live escrow names a known contract', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    escrow_ref: `ref-known-${Date.now()}`,
    escrow_contract: CURRENT,
  })

  const registry = buildContractRegistry([source(CURRENT)], [])
  await assertEscrowContractsKnown(app.db, registry)
})

test('boot gate: REFUSES to start when a live escrow names a forgotten contract', { skip }, async () => {
  // The silent failure this exists to make loud: history lost to an older
  // database restore narrows the known set, and the escrows whose funds sit in
  // the forgotten contract begin returning 409 with nobody told.
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    escrow_ref: `ref-forgotten-${Date.now()}`,
    escrow_contract: PREVIOUS,
  })

  const registry = buildContractRegistry([source(CURRENT)], [])
  await assert.rejects(
    assertEscrowContractsKnown(app.db, registry),
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : ''
      // Actionable: names the escrow AND the address to restore.
      return msg.includes(escrow.id) && msg.includes(PREVIOUS)
    },
  )
})

test('boot gate: a TERMINAL escrow on a forgotten contract does NOT block boot', { skip }, async () => {
  // Its money already moved, so it can never need a transaction again. Letting
  // settled history crash-loop a deploy would be the worse failure.
  const app = getApp()
  const creator = await createUser(app)
  await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'completed',
    escrow_ref: `ref-terminal-${Date.now()}`,
    escrow_contract: PREVIOUS,
  })

  await assertEscrowContractsKnown(app.db, buildContractRegistry([source(CURRENT)], []))
})

test('boot gate: an UNSTAMPED escrow does not trip the probe', { skip }, async () => {
  // Null means "unknown", which the resolver handles; only a stamp that names
  // something outside the set is evidence of lost history.
  const app = getApp()
  const creator = await createUser(app)
  await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    escrow_ref: `ref-null-${Date.now()}`,
    escrow_contract: null,
  })

  await assertEscrowContractsKnown(app.db, buildContractRegistry([source(CURRENT)], []))
})

test('boot gate: once the history is restored, the same database starts', { skip }, async () => {
  // The fix the error message tells the operator to apply must actually work.
  const app = getApp()
  const creator = await createUser(app)
  await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    escrow_ref: `ref-restore-${Date.now()}`,
    escrow_contract: PREVIOUS,
  })

  await assert.rejects(assertEscrowContractsKnown(app.db, buildContractRegistry([source(CURRENT)], [])))

  await record(app, PREVIOUS)
  const restored = await loadContractRegistry(app.db, [source(CURRENT)])
  await assertEscrowContractsKnown(app.db, restored)
})

test('the probe reports across chains and stays bounded', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  for (let i = 0; i < 3; i += 1) {
    await createEscrow(app, {
      creator_id: creator.row.id,
      status: 'open',
      escrow_ref: `ref-many-${i}-${Date.now()}`,
      escrow_contract: PREVIOUS,
    })
  }

  const before = (await app.db.select({ id: escrows.id }).from(escrows)).length

  const found = await findUnknownContractEscrows(app.db, buildContractRegistry([source(CURRENT)], []), 2)

  assert.strictEqual(found.length, 2, 'the sample is capped, not exhaustive')
  assert.strictEqual(found[0].chain_id, TEST_CHAIN_ID)
  assert.strictEqual(found[0].escrow_contract, PREVIOUS)
  // A boot gate must never mutate: same row count after as before, so a future
  // "clean up the bad rows" refactor cannot quietly delete live escrows.
  const after = (await app.db.select({ id: escrows.id }).from(escrows)).length
  assert.strictEqual(after, before)
})
