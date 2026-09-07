/**
 * The application wallet choice: apply RECORDS the wallet the worker will be
 * assigned under, and assign BAKES exactly that record.
 *
 * Two bugs anchor this suite. Applying used to need no wallet at all — the
 * first check fired at assign time, 422ing the POSTER for the worker's gap.
 * And the assign baked the worker's PRIMARY, a wallet they never chose and
 * may not control at that moment. The capture assertions use the fake
 * chain's `capturedBuilds`, because the routes only decide what gets baked —
 * the fake returns a constant tx.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { and, eq } from 'drizzle-orm'
import { gig_applications, user_wallets } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  TEST_ASSET_ALT,
  TEST_CHAIN_ID_ALT,
  useTestApp,
  capturedBuilds,
  createUser,
  createTransactableUser,
  createEscrow,
  attachGigDetails,
  makeTransactable,
  seedAltChain,
  authHeader,
  testWalletAddress,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
type App = ReturnType<typeof getApp>

const SECOND_WALLET = 'SecondChoiceWa11et11111111111111111111111'

async function approvalGig(app: App, creator_id: string) {
  const escrow = await createEscrow(app, {
    creator_id,
    status: 'open',
    requires_approval: true,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })
  await attachGigDetails(app, escrow.id, {})
  return escrow
}

async function linkSecondWallet(app: App, user_id: string, address = SECOND_WALLET) {
  await app.db
    .insert(user_wallets)
    .values({ chain_ns: 'solana', address, user_id, is_primary: false, verified_at: new Date() })
}

const apply = (app: App, token: string, id: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/v1/gigs/${id}/applications`,
    headers: authHeader(token),
    payload: body,
  })

const assign = (app: App, token: string, id: string, worker_user_id: string) =>
  app.inject({
    method: 'POST',
    url: `/v1/escrows/${id}/assign`,
    headers: authHeader(token),
    payload: { worker_user_id },
  })

async function storedWallet(app: App, escrow_id: string, applicant_id: string) {
  const [row] = await app.db
    .select({ wallet_address: gig_applications.wallet_address })
    .from(gig_applications)
    .where(
      and(
        eq(gig_applications.escrow_id, escrow_id),
        eq(gig_applications.applicant_id, applicant_id),
      ),
    )
    .limit(1)
  return row?.wallet_address
}

/** The worker_address the LAST assignAccept build was handed. */
function lastBakedWorker(): string | undefined {
  const build = [...capturedBuilds].reverse().find((b) => b.action === 'assignAccept')
  return build?.action === 'assignAccept' ? build.payload.worker_address : undefined
}

// ---------- apply records the choice ---------------------------------------

test('apply with NO wallet on the gig chain → 403 WALLET_REQUIRED naming the namespace', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app) // no wallet linked
  const gig = await approvalGig(app, poster.row.id)

  const res = await apply(app, worker.token, gig.id)
  assert.strictEqual(res.statusCode, 403)
  const body = res.json()
  assert.strictEqual(body.code, ErrorCode.WALLET_REQUIRED)
  // The detail routes the client to the RIGHT link-wallet flow.
  assert.strictEqual(body.details.chain_ns, 'solana')
})

test('apply without a declared wallet records the PRIMARY (the server-side default)', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)

  const res = await apply(app, worker.token, gig.id, { message: 'hi' })
  assert.strictEqual(res.statusCode, 201)
  // On the wire (the worker's own view) AND on the row.
  assert.strictEqual(res.json().wallet_address, testWalletAddress(worker.row.id))
  assert.strictEqual(await storedWallet(app, gig.id, worker.row.id), testWalletAddress(worker.row.id))
})

test('a declared wallet must be the CALLER’s verified wallet → 422 for a stranger address', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)

  const res = await apply(app, worker.token, gig.id, { wallet_address: SECOND_WALLET })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, ErrorCode.ESCROW_WRONG_WALLET)
})

test('a declared linked wallet is recorded — and a RE-apply updates the choice', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  await linkSecondWallet(app, worker.row.id)
  const gig = await approvalGig(app, poster.row.id)

  const first = await apply(app, worker.token, gig.id, { wallet_address: SECOND_WALLET })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(first.json().wallet_address, SECOND_WALLET)

  // Changing their mind re-records; the row must follow the LATEST choice.
  const second = await apply(app, worker.token, gig.id, {
    wallet_address: testWalletAddress(worker.row.id),
  })
  assert.strictEqual(second.statusCode, 201)
  assert.strictEqual(
    await storedWallet(app, gig.id, worker.row.id),
    testWalletAddress(worker.row.id),
  )
})

test('an EVM choice is recorded in CANONICAL form, whatever casing the client sent', { skip }, async () => {
  // EVM equality folds case, so a scrambled-casing variant of the caller's own
  // wallet passes the trust check — but viem REFUSES a bad-checksum mixed-case
  // address at encode time, so recording the client's casing verbatim lets an
  // applicant mint a 500 on the POSTER's assign. The record must be the
  // canonical (lowercased) form, which every encoder accepts.
  const app = getApp()
  await seedAltChain(app)
  const poster = await createUser(app)
  const worker = await createUser(app)
  const linked = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'
  await app.db.insert(user_wallets).values({
    chain_ns: 'eip155',
    address: linked,
    user_id: worker.row.id,
    is_primary: true,
    verified_at: new Date(),
  })
  const gig = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    requires_approval: true,
    chain_id: TEST_CHAIN_ID_ALT,
    asset: TEST_ASSET_ALT,
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })
  await attachGigDetails(app, gig.id, {})

  const scrambled = linked.toUpperCase().replace('0X', '0x')
  const res = await apply(app, worker.token, gig.id, { wallet_address: scrambled })
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.json().wallet_address, linked.toLowerCase())
  assert.strictEqual(await storedWallet(app, gig.id, worker.row.id), linked.toLowerCase())
})

test('garbage wallet_address (empty string) → 400, never silently the primary', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)

  const res = await apply(app, worker.token, gig.id, { wallet_address: '' })
  assert.strictEqual(res.statusCode, 400)
})

// ---------- assign bakes the record ----------------------------------------

test('assign bakes the RECORDED wallet, not the primary', { skip }, async () => {
  const app = getApp()
  const poster = await createTransactableUser(app)
  const worker = await createTransactableUser(app)
  await linkSecondWallet(app, worker.row.id)
  const gig = await approvalGig(app, poster.row.id)

  await apply(app, worker.token, gig.id, { wallet_address: SECOND_WALLET })
  const res = await assign(app, poster.token, gig.id, worker.row.id)
  assert.strictEqual(res.statusCode, 200)
  // The build was handed the CHOICE — the primary never enters the tx.
  assert.strictEqual(lastBakedWorker(), SECOND_WALLET)
})

test('a recorded wallet UNLINKED since applying → 422, never a silent primary swap', { skip }, async () => {
  const app = getApp()
  const poster = await createTransactableUser(app)
  const worker = await createTransactableUser(app)
  await linkSecondWallet(app, worker.row.id)
  const gig = await approvalGig(app, poster.row.id)

  await apply(app, worker.token, gig.id, { wallet_address: SECOND_WALLET })
  await app.db
    .delete(user_wallets)
    .where(and(eq(user_wallets.user_id, worker.row.id), eq(user_wallets.address, SECOND_WALLET)))

  const res = await assign(app, poster.token, gig.id, worker.row.id)
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, ErrorCode.ASSIGNEE_WALLET_REQUIRED)
  // No build happened: nothing may bake a wallet the worker did not choose.
  assert.strictEqual(lastBakedWorker(), undefined)
})

test('a LEGACY application (no recorded wallet) still assigns under the primary', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  await makeTransactable(app, poster.row.id)
  await makeTransactable(app, worker.row.id)
  const gig = await approvalGig(app, poster.row.id)
  // Pre-column row: inserted directly, wallet_address NULL.
  await app.db.insert(gig_applications).values({
    escrow_id: gig.id,
    applicant_id: worker.row.id,
    status: 'open',
    expires_at: new Date(Date.now() + 86_400_000),
  })

  const res = await assign(app, poster.token, gig.id, worker.row.id)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(lastBakedWorker(), testWalletAddress(worker.row.id))
})

// ---------- who sees the choice --------------------------------------------

test('the poster’s shortlist NEVER carries applicant wallets; the worker’s own list does', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createTransactableUser(app)
  const gig = await approvalGig(app, poster.row.id)
  await apply(app, worker.token, gig.id)

  const shortlist = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${gig.id}/applications`,
    headers: authHeader(poster.token),
  })
  assert.strictEqual(shortlist.statusCode, 200)
  const [applicant] = shortlist.json().data
  assert.strictEqual(applicant.applicant_id, worker.row.id)
  assert.ok(!('wallet_address' in applicant), 'shortlist rows must not expose applicant wallets')

  const mine = await app.inject({
    method: 'GET',
    url: '/v1/applications',
    headers: authHeader(worker.token),
  })
  assert.strictEqual(mine.statusCode, 200)
  assert.strictEqual(
    mine.json().data[0].application.wallet_address,
    testWalletAddress(worker.row.id),
  )

  // The gig detail's viewer block is the THIRD surface carrying the choice
  // (it is what re-apply preselects from) — wiring, not the shared mapper,
  // is what a regression here would break.
  const detail = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${gig.id}`,
    headers: authHeader(worker.token),
  })
  assert.strictEqual(
    detail.json().viewer.application.wallet_address,
    testWalletAddress(worker.row.id),
  )
})
