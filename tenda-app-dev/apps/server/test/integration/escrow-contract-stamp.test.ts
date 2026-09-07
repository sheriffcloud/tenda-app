/**
 * Where `escrows.escrow_contract` comes from, end to end (open_issues #89).
 *
 * Three writers, in order of authority:
 *   1. POST /v1/escrows          — the contract current when the tx was built
 *   2. POST /:id/build-create    — re-stamped, because a draft holds no funds
 *   3. the EscrowCreated applier — the contract that ATTESTABLY took custody
 *
 * (3) overwriting (1) is the property worth protecting: a create built moments
 * before a redeploy and mined moments after must record where the money really
 * went, not where the server meant to send it. Same principle as reading
 * settlement amounts off the event rather than projecting them.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { applyEscrowEvent, drizzleEscrowEventStore } from '@server/lib/escrow-events'
import {
  TEST_DB_CONFIGURED,
  FAKE_SOLANA_PROGRAM,
  useTestApp,
  createTransactableUser,
  createUser,
  createEscrow,
  authHeader,
  TEST_CHAIN_ID,
  TEST_CHAIN_ID_ALT,
  TEST_ASSET_ALT,
  seedAltChain,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function stampOf(app: ReturnType<typeof getApp>, id: string): Promise<string | null> {
  const [row] = await app.db
    .select({ escrow_contract: escrows.escrow_contract })
    .from(escrows)
    .where(eq(escrows.id, id))
  return row.escrow_contract
}

// ---------- 1. create stamps the current contract ---------------------------

test('POST /v1/escrows stamps the contract the create tx was built against', { skip }, async () => {
  const app = getApp()
  const user = await createTransactableUser(app)

  const res = await app.inject({
    method: 'POST',
    url: '/v1/escrows',
    headers: authHeader(user.token),
    payload: createEscrowBody(),
  })
  assert.strictEqual(res.statusCode, 201)

  // The adapter's own address — never the seeded `chains.escrow_program`
  // column, which is written only by db:seed and has gone stale before.
  assert.strictEqual(await stampOf(app, res.json().escrow_id), FAKE_SOLANA_PROGRAM)
})

// ---------- 2. build-create re-stamps a draft -------------------------------

test('build-create RE-stamps a draft left on a superseded contract', { skip }, async () => {
  // A draft holds no funds, so there is nothing to strand: it publishes into
  // whatever contract is current when it is actually created. Preserving the
  // old stamp would encode a create for a contract we are not building against.
  const app = getApp()
  const creator = await createTransactableUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'draft',
    escrow_contract: 'SupersededProgram111111111111111111111111',
    completion_duration_seconds: 7_200,
  })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/build-create`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(await stampOf(app, escrow.id), FAKE_SOLANA_PROGRAM)
})

test('build-create leaves a draft already on the current contract untouched', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'draft',
    escrow_contract: FAKE_SOLANA_PROGRAM,
    completion_duration_seconds: 7_200,
  })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/build-create`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(await stampOf(app, escrow.id), FAKE_SOLANA_PROGRAM)
})

// ---------- 3. the chain has the last word ----------------------------------

test('EscrowCreated OVERWRITES the stamp with the contract that emitted it', { skip }, async () => {
  // The race this exists for: the create was built against A, the operator
  // swapped to B, and the transaction mined into A. The row must say A.
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'draft',
    escrow_contract: 'IntendedProgram1111111111111111111111111',
  })

  const emitter = 'ActualProgram111111111111111111111111111'
  const result = await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' },
    {
      name: 'EscrowCreated',
      escrow_ref: `ref-${escrow.id}`,
      contract: emitter,
      fields: { escrow_id: escrow.id, creator: 'CreatorWallet1111', amount: '1000000' },
    },
    `tx-${escrow.id}`,
  )

  assert.strictEqual(result.applied, true)
  assert.strictEqual(await stampOf(app, escrow.id), emitter)
})

test('the attested stamp is NORMALISED before it is stored', { skip }, async () => {
  // The column is compared in SQL by the boot probe, which is case-sensitive.
  // An EVM decoder emitting a checksummed address would therefore store a value
  // that reads as an UNKNOWN contract and holds up the next boot — for a
  // contract the registry actually knows.
  const app = getApp()
  await seedAltChain(app) // the eip155 chain is opt-in; resetDb seeds solana only
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
    status: 'draft',
  })

  await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'eip155' },
    {
      name: 'EscrowCreated',
      escrow_ref: `ref-case-${escrow.id}`,
      contract: '0x954FC8a4908f49B7499504190ab11d925dEE490b', // checksummed
      fields: { escrow_id: escrow.id, creator: '0x1111', amount: '1000000' },
    },
    `tx-case-${escrow.id}`,
  )

  assert.strictEqual(
    await stampOf(app, escrow.id),
    '0x954fc8a4908f49b7499504190ab11d925dee490b',
  )
})

test('a NON-create event never rewrites the stamp', { skip }, async () => {
  // Only EscrowCreated establishes custody. If, say, EscrowAccepted could
  // restamp, an escrow could drift onto a contract that never held its funds.
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    escrow_contract: FAKE_SOLANA_PROGRAM,
    escrow_ref: `ref-${Date.now()}`,
  })

  await applyEscrowEvent(
    { store: drizzleEscrowEventStore(app.db), chain_ns: 'solana' },
    {
      name: 'EscrowAccepted',
      escrow_ref: `ref-accept-${escrow.id}`,
      contract: 'SomeOtherProgram11111111111111111111111',
      fields: {
        escrow_id: escrow.id,
        counterparty: 'WorkerWallet11111',
        completion_deadline: String(Math.floor(Date.now() / 1000) + 7_200),
      },
    },
    `tx-accept-${escrow.id}`,
  )

  assert.strictEqual(await stampOf(app, escrow.id), FAKE_SOLANA_PROGRAM)
})

// ---------- transitions route by the stamp ----------------------------------

test('a transition on an escrow with an UNKNOWN stamp is refused, not mis-sent', { skip }, async () => {
  // The failure mode that matters: rather than building a transaction against
  // the wrong contract (which would revert on chain and strand the escrow), the
  // route refuses with a diagnosable error and builds nothing.
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    chain_id: TEST_CHAIN_ID,
    status: 'submitted',
    escrow_ref: `ref-unknown-${Date.now()}`,
    escrow_contract: 'ForgottenProgram11111111111111111111111',
  })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/approve`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'ESCROW_MISMATCH')
})

test('a transition on an escrow with the CURRENT stamp still builds', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    chain_id: TEST_CHAIN_ID,
    status: 'submitted',
    escrow_ref: `ref-current-${Date.now()}`,
    escrow_contract: FAKE_SOLANA_PROGRAM,
  })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/approve`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
})

test('an UNSTAMPED escrow still builds — no backfill was required', { skip }, async () => {
  // Every row created before the column existed is NULL. While the chain has
  // run exactly one contract there is nothing to be wrong about, which is why
  // shipping this needed no data migration.
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    chain_id: TEST_CHAIN_ID,
    status: 'submitted',
    escrow_ref: `ref-legacy-${Date.now()}`,
    escrow_contract: null,
  })

  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/approve`,
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
})

// ---------- the column must not leak to the public wire ---------------------

test('the public gig detail does NOT expose the escrow contract', { skip }, async () => {
  // Adding a column to `escrows` is one `select()` away from appearing on a
  // public payload — `lib/escrow/dossier.ts` selects the whole row on purpose.
  // The public detail surfaces are narrowed selects and must stay that way.
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    escrow_ref: `ref-public-${Date.now()}`,
    escrow_contract: FAKE_SOLANA_PROGRAM,
  })

  const res = await app.inject({ method: 'GET', url: `/v1/gigs/${escrow.id}` })
  if (res.statusCode === 200) {
    assert.ok(
      !JSON.stringify(res.json()).includes('escrow_contract'),
      'escrow_contract must not appear on the public gig detail',
    )
  }
})
